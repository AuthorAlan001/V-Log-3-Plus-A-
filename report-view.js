// ═══════════════════════════════════════════════════
// REPORT-VIEW.JS — Doctor Report with Comments Journal
// ═══════════════════════════════════════════════════


window.ReportView = function ReportView({
  records, settings, maHistory, intakes, filters, onFiltersChange,
  doctorNotes, onDoctorNotesChange, showToast, onShowReport,
  providerConfig,
}) {
  const [noteText, setNoteText] = useState("");
  const filtered = applyFilters(records, filters);
  const hasFilters = isFiltered(filters);
  const filterDesc = hasFilters ? getFilterDesc(filters) : "";
  const rpt = filtered;

  const dateRange = rpt.length > 0
    ? { from: rpt[0].date, to: rpt[rpt.length - 1].date }
    : { from: "", to: "" };
  const totalDays = rpt.length > 0
    ? Math.max(1, Math.round((new Date(dateRange.to) - new Date(dateRange.from)) / 86400000) + 1) : 0;
  const voidsPerDay = totalDays > 0 ? (rpt.length / totalDays).toFixed(1) : 0;
  const nightVoids = rpt.filter(r => r.wokeMe === "Yes" || r.mode === "Asleep").length;
  const nightVoidsPerDay = totalDays > 0 ? (nightVoids / totalDays).toFixed(1) : 0;
  const accidentCount = rpt.filter(r => r.accident === "Yes" || r.accident === "Minor").length;
  const volumes = rpt.map(r => safeNum(r.volume)).filter(v => v > 0);
  const avgVolume = volumes.length > 0 ? (volumes.reduce((a, b) => a + b, 0) / volumes.length).toFixed(0) : 0;
  const avgInitUrge = rpt.length > 0 ? (rpt.reduce((s, r) => s + safeNum(r.initUrge), 0) / rpt.length).toFixed(1) : 0;
  const currentMa = maHistory.length > 0 ? maHistory[maHistory.length - 1].mA : settings.mA;
  const totalFluidIn = intakes.filter(i => i.category === "Drink").reduce((s, i) => s + safeNum(i.amount), 0);
  const daysWithFluid = new Set(intakes.filter(i => i.category === "Drink" && safeNum(i.amount) > 0).map(i => i.date)).size;
  const avgDailyFluid = daysWithFluid > 0 ? Math.round(totalFluidIn / daysWithFluid) : "—";
  const fluidPartial = daysWithFluid > 0 && daysWithFluid < totalDays;

  // Tolerance
  const targetDef = safeNum(settings.targetDeferral, 5);
  const deferralsWithValues = rpt.filter(r => safeNum(r.deferral) > 0);
  const toleranceMet = deferralsWithValues.filter(r => safeNum(r.deferral) >= targetDef).length;
  const tolerancePct = deferralsWithValues.length > 0 ? Math.round((toleranceMet / deferralsWithValues.length) * 100) : 0;

  // ── Add doctor note ──
  const addNote = async () => {
    if (!noteText.trim()) return;
    const entry = {
      id: Date.now().toString(),
      date: localDate(),
      time: localTime(),
      text: noteText.trim(),
    };
    const updated = [...doctorNotes, entry];
    onDoctorNotesChange(updated);
    await saveDoctorNotes(updated);
    setNoteText("");
    showToast("Note saved");
  };

  const deleteNote = async (id) => {
    const updated = doctorNotes.filter(n => n.id !== id);
    onDoctorNotesChange(updated);
    await saveDoctorNotes(updated);
    showToast("Note removed");
  };

  // ── Generate full HTML report ──
  const printReport = () => {
    const minorCount = rpt.filter(r => r.accident === "Minor").length;
    const maxVol = volumes.length > 0 ? Math.max(...volumes) : 0;
    const minVol = volumes.length > 0 ? Math.min(...volumes) : 0;
    const avgFinalUrge = rpt.length > 0 ? (rpt.reduce((s, r) => s + safeNum(r.finalUrge), 0) / rpt.length).toFixed(1) : 0;
    const deferrals2 = rpt.map(r => safeNum(r.deferral)).filter(d => d > 0);
    const avgDeferral = deferrals2.length > 0 ? (deferrals2.reduce((a, b) => a + b, 0) / deferrals2.length).toFixed(1) : "N/A";

    const byDate = {};
    rpt.forEach(r => {
      if (!byDate[r.date]) byDate[r.date] = { count: 0, vol: 0, nightCount: 0, fluidIn: 0, meals: 0, initUrgeSum: 0, finalUrgeSum: 0 };
      byDate[r.date].count++;
      byDate[r.date].vol += safeNum(r.volume);
      byDate[r.date].initUrgeSum += safeNum(r.initUrge);
      byDate[r.date].finalUrgeSum += safeNum(r.finalUrge);
      if (r.wokeMe === "Yes" || r.mode === "Asleep") byDate[r.date].nightCount++;
    });
    intakes.forEach(i => {
      if (!byDate[i.date]) byDate[i.date] = { count: 0, vol: 0, nightCount: 0, fluidIn: 0, meals: 0, initUrgeSum: 0, finalUrgeSum: 0 };
      if (i.category === "Drink") byDate[i.date].fluidIn += safeNum(i.amount);
      else byDate[i.date].meals++;
    });

    const chartDays = Object.keys(byDate).sort();
    const chartData = chartDays.map(d => ({
      label: new Date(d+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"}),
      vol: byDate[d].vol, count: byDate[d].count, wakes: byDate[d].nightCount, fluidIn: byDate[d].fluidIn || 0,
      avgInitUrge: byDate[d].count > 0 ? +(byDate[d].initUrgeSum / byDate[d].count).toFixed(1) : 0,
      avgFinalUrge: byDate[d].count > 0 ? +(byDate[d].finalUrgeSum / byDate[d].count).toFixed(1) : 0,
    }));
    const mAByDay = {};
    rpt.forEach(r => { mAByDay[r.date] = safeNum(r.mA, 0.7); });
    const mAData = chartDays.map(d => mAByDay[d] || 0);

    // SVG chart helpers
    const svgW = 660, svgH = 200, pad = { t: 20, r: 50, b: 40, l: 45 };
    const plotW = svgW - pad.l - pad.r, plotH = svgH - pad.t - pad.b;
    const n = chartData.length || 1;
    const barW = Math.min(30, Math.floor(plotW / n * 0.6));
    const gap = plotW / n;

    const makeBarChart = (title, data, key1, color1, key2, color2) => {
      const maxVal = Math.max(1, ...data.map(d => (d[key1] || 0) + (key2 ? (d[key2] || 0) : 0)));
      const yScale = plotH / maxVal;
      const yTicks = 5;
      let bars = '', labels = '', gridLines = '';
      for (let i = 0; i <= yTicks; i++) {
        const yVal = Math.round(maxVal / yTicks * i);
        const y = pad.t + plotH - (yVal * yScale);
        gridLines += `<line x1="${pad.l}" y1="${y}" x2="${svgW-pad.r}" y2="${y}" stroke="#e2e8f0" stroke-width="0.5"/>`;
        gridLines += `<text x="${pad.l-5}" y="${y+4}" text-anchor="end" fill="#94a3b8" font-size="10">${yVal}</text>`;
      }
      data.forEach((d, i) => {
        const x = pad.l + i * gap + gap/2 - barW/2;
        const v1 = d[key1] || 0;
        const h1 = v1 * yScale;
        bars += `<rect x="${x}" y="${pad.t+plotH-h1}" width="${barW}" height="${h1}" fill="${color1}" rx="2"/>`;
        if (key2) {
          const v2 = d[key2] || 0;
          const h2 = v2 * yScale;
          bars += `<rect x="${x}" y="${pad.t+plotH-h1-h2}" width="${barW}" height="${h2}" fill="${color2}" rx="2"/>`;
        }
        labels += `<text x="${pad.l+i*gap+gap/2}" y="${svgH-pad.b+14}" text-anchor="middle" fill="#64748b" font-size="9" transform="rotate(-30 ${pad.l+i*gap+gap/2} ${svgH-pad.b+14})">${d.label}</text>`;
      });
      return `<div style="margin:12px 0"><div style="font-size:14px;font-weight:600;color:#334155;margin-bottom:6px">${title}</div>
        <svg width="100%" viewBox="0 0 ${svgW} ${svgH}" style="background:#fafbfc;border:1px solid #e2e8f0;border-radius:8px">${gridLines}${bars}${labels}</svg></div>`;
    };

    const makeLineChart = (title, data, key1, color1, key2, color2, maxOverride) => {
      const allVals = data.flatMap(d => [d[key1]||0, key2 ? (d[key2]||0) : 0]);
      const maxVal = maxOverride || Math.max(1, ...allVals);
      const yScale = plotH / maxVal;
      const yTicks = Math.min(maxVal, 5);
      let gridLines = '';
      for (let i = 0; i <= yTicks; i++) {
        const yVal = maxOverride ? (maxVal / yTicks * i) : Math.round(maxVal / yTicks * i);
        const y = pad.t + plotH - (yVal * yScale);
        gridLines += `<line x1="${pad.l}" y1="${y}" x2="${svgW-pad.r}" y2="${y}" stroke="#e2e8f0" stroke-width="0.5"/>`;
        gridLines += `<text x="${pad.l-5}" y="${y+4}" text-anchor="end" fill="#94a3b8" font-size="10">${Number.isInteger(yVal)?yVal:yVal.toFixed(1)}</text>`;
      }
      const makePath = (key, color) => {
        const pts = data.map((d, i) => {
          const x = pad.l + i * gap + gap/2;
          const y = pad.t + plotH - ((d[key]||0) * yScale);
          return `${i===0?'M':'L'}${x},${y}`;
        }).join(' ');
        const dots = data.map((d, i) => {
          const x = pad.l + i * gap + gap/2;
          const y = pad.t + plotH - ((d[key]||0) * yScale);
          return `<circle cx="${x}" cy="${y}" r="3" fill="${color}"/>`;
        }).join('');
        return `<path d="${pts}" fill="none" stroke="${color}" stroke-width="2"/>${dots}`;
      };
      let labels = '';
      data.forEach((d, i) => {
        labels += `<text x="${pad.l+i*gap+gap/2}" y="${svgH-pad.b+14}" text-anchor="middle" fill="#64748b" font-size="9" transform="rotate(-30 ${pad.l+i*gap+gap/2} ${svgH-pad.b+14})">${d.label}</text>`;
      });
      return `<div style="margin:12px 0"><div style="font-size:14px;font-weight:600;color:#334155;margin-bottom:6px">${title}</div>
        <svg width="100%" viewBox="0 0 ${svgW} ${svgH}" style="background:#fafbfc;border:1px solid #e2e8f0;border-radius:8px">${gridLines}${makePath(key1,color1)}${key2?makePath(key2,color2):''}${labels}</svg>
        <div style="font-size:11px;color:#94a3b8;margin-top:4px"><span style="color:${color1}">● ${key1}</span>${key2?` &nbsp; <span style="color:${color2}">● ${key2}</span>`:''}</div></div>`;
    };

    // Volume + mA combo chart
    const volMaChart = (() => {
      const maxVol2 = Math.max(1, ...chartData.map(d => d.vol));
      const maxMa2 = Math.max(1, ...mAData);
      const yScaleV = plotH / maxVol2;
      const yScaleMa = plotH / maxMa2;
      const yTicks = 5;
      let gridLines = '';
      for (let i = 0; i <= yTicks; i++) {
        const yVal = Math.round(maxVol2 / yTicks * i);
        const y = pad.t + plotH - (yVal * yScaleV);
        gridLines += `<line x1="${pad.l}" y1="${y}" x2="${svgW-pad.r}" y2="${y}" stroke="#e2e8f0" stroke-width="0.5"/>`;
        gridLines += `<text x="${pad.l-5}" y="${y+4}" text-anchor="end" fill="#94a3b8" font-size="10">${yVal}</text>`;
      }
      for (let i = 0; i <= 4; i++) {
        const maVal = (maxMa2 / 4 * i).toFixed(1);
        const y = pad.t + plotH - (parseFloat(maVal) * yScaleMa);
        gridLines += `<text x="${svgW-pad.r+5}" y="${y+4}" fill="#7c3aed" font-size="10">${maVal}</text>`;
      }
      let bars = '', labels = '';
      chartData.forEach((d, i) => {
        const x = pad.l + i * gap + gap/2 - barW/2;
        const h = d.vol * yScaleV;
        bars += `<rect x="${x}" y="${pad.t+plotH-h}" width="${barW}" height="${h}" fill="#3b82f6" opacity="0.7" rx="2"/>`;
        labels += `<text x="${pad.l+i*gap+gap/2}" y="${svgH-pad.b+14}" text-anchor="middle" fill="#64748b" font-size="9" transform="rotate(-30 ${pad.l+i*gap+gap/2} ${svgH-pad.b+14})">${d.label}</text>`;
      });
      let maLine = '';
      const maPts = mAData.map((ma, i) => ({ x: pad.l + i * gap + gap/2, y: pad.t + plotH - (ma * yScaleMa) }));
      for (let i = 0; i < maPts.length; i++) {
        if (i > 0) {
          maLine += `<line x1="${maPts[i-1].x}" y1="${maPts[i-1].y}" x2="${maPts[i].x}" y2="${maPts[i-1].y}" stroke="#7c3aed" stroke-width="2" stroke-dasharray="4,3"/>`;
          maLine += `<line x1="${maPts[i].x}" y1="${maPts[i-1].y}" x2="${maPts[i].x}" y2="${maPts[i].y}" stroke="#7c3aed" stroke-width="2" stroke-dasharray="4,3"/>`;
        }
        maLine += `<circle cx="${maPts[i].x}" cy="${maPts[i].y}" r="3" fill="#7c3aed"/>`;
      }
      return `<div style="margin:12px 0"><div style="font-size:14px;font-weight:600;color:#334155;margin-bottom:6px">Daily Total Volume (ml) & mA Setting</div>
        <svg width="100%" viewBox="0 0 ${svgW} ${svgH}" style="background:#fafbfc;border:1px solid #e2e8f0;border-radius:8px">${gridLines}${bars}${maLine}${labels}</svg>
        <div style="font-size:11px;color:#94a3b8;margin-top:4px"><span style="color:#3b82f6">■ Volume (ml)</span> &nbsp; <span style="color:#7c3aed">--- mA Setting</span></div></div>`;
    })();

    // Daily average urge scatter chart (blue triangles = initial, orange squares = final)
    const urgeScatterChart = (() => {
      const yScale = plotH / 4;
      let gridLines = '', shapes = '', labels = '';
      for (let i = 0; i <= 4; i++) {
        const y = pad.t + plotH - (i * yScale);
        gridLines += `<line x1="${pad.l}" y1="${y}" x2="${svgW-pad.r}" y2="${y}" stroke="#e2e8f0" stroke-width="0.5"/>`;
        gridLines += `<text x="${pad.l-5}" y="${y+4}" text-anchor="end" fill="#94a3b8" font-size="10">${i}</text>`;
      }
      chartData.forEach((d, i) => {
        const cx = pad.l + i * gap + gap/2;
        const yInit = pad.t + plotH - (d.avgInitUrge * yScale);
        const yFinal = pad.t + plotH - (d.avgFinalUrge * yScale);
        // Blue triangle for initial urge
        shapes += `<polygon points="${cx},${yInit-7} ${cx-7},${yInit+5} ${cx+7},${yInit+5}" fill="#3b82f6" stroke="#2563eb" stroke-width="1"/>`;
        // Orange square for final urge
        shapes += `<rect x="${cx-5}" y="${yFinal-5}" width="10" height="10" fill="#f97316" stroke="#ea580c" stroke-width="1"/>`;
        labels += `<text x="${cx}" y="${svgH-pad.b+14}" text-anchor="middle" fill="#64748b" font-size="9" transform="rotate(-30 ${cx} ${svgH-pad.b+14})">${d.label}</text>`;
      });
      return `<div style="margin:12px 0"><div style="font-size:14px;font-weight:600;color:#334155;margin-bottom:6px">Daily Avg Urge: Initial vs Final</div>
        <svg width="100%" viewBox="0 0 ${svgW} ${svgH}" style="background:#fafbfc;border:1px solid #e2e8f0;border-radius:8px">${gridLines}${shapes}${labels}</svg>
        <div style="font-size:11px;color:#94a3b8;margin-top:4px"><span style="color:#3b82f6">▲ Avg Initial</span> &nbsp; <span style="color:#f97316">■ Avg Final</span> &nbsp; Lower orange = better resolution</div></div>`;
    })();
    const hasFluid = chartData.some(d => d.fluidIn > 0);
    const fluidChart = hasFluid ? (() => {
      const maxF = Math.max(1, ...chartData.map(d => Math.max(d.vol, d.fluidIn)));
      const yScale = plotH / maxF;
      const halfBar = Math.min(14, Math.floor(barW/2));
      const yTicks = 5;
      let gridLines = '', bars = '', labels = '';
      for (let i = 0; i <= yTicks; i++) {
        const yVal = Math.round(maxF / yTicks * i);
        const y = pad.t + plotH - (yVal * yScale);
        gridLines += `<line x1="${pad.l}" y1="${y}" x2="${svgW-pad.r}" y2="${y}" stroke="#e2e8f0" stroke-width="0.5"/>`;
        gridLines += `<text x="${pad.l-5}" y="${y+4}" text-anchor="end" fill="#94a3b8" font-size="10">${yVal}</text>`;
      }
      chartData.forEach((d, i) => {
        const cx = pad.l + i * gap + gap/2;
        const h1 = d.fluidIn * yScale;
        const h2 = d.vol * yScale;
        bars += `<rect x="${cx-halfBar-1}" y="${pad.t+plotH-h1}" width="${halfBar}" height="${h1}" fill="#3b82f6" rx="2"/>`;
        bars += `<rect x="${cx+1}" y="${pad.t+plotH-h2}" width="${halfBar}" height="${h2}" fill="#22c55e" rx="2"/>`;
        labels += `<text x="${cx}" y="${svgH-pad.b+14}" text-anchor="middle" fill="#64748b" font-size="9" transform="rotate(-30 ${cx} ${svgH-pad.b+14})">${d.label}</text>`;
      });
      return `<div style="margin:12px 0"><div style="font-size:14px;font-weight:600;color:#334155;margin-bottom:6px">Fluid In vs Void Out (ml)</div>
        <svg width="100%" viewBox="0 0 ${svgW} ${svgH}" style="background:#fafbfc;border:1px solid #e2e8f0;border-radius:8px">${gridLines}${bars}${labels}</svg>
        <div style="font-size:11px;color:#94a3b8;margin-top:4px"><span style="color:#3b82f6">■ Fluid In</span> &nbsp; <span style="color:#22c55e">■ Void Out</span></div></div>`;
    })() : '';

    // Doctor notes section
    const notesHtml = doctorNotes.length > 0 ? `
      <h2>Patient Comments & Questions</h2>
      ${doctorNotes.map(n => `
        <div style="margin:8px 0;padding:10px 14px;background:#f0f9ff;border-left:3px solid #3b82f6;border-radius:4px;">
          <div style="font-size:11px;color:#64748b;">${new Date(n.date+"T00:00:00").toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})} at ${fmtTime(n.time)}</div>
          <div style="font-size:14px;color:#1e293b;margin-top:4px;">${n.text.replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br/>')}</div>
        </div>
      `).join("")}
    ` : '';

    const html = `<!DOCTYPE html><html><head><title>Neuro-Stim Report</title>
    <style>
      body { font-family: Arial, sans-serif; max-width: 700px; margin: 40px auto; color: #1a1a1a; padding: 0 20px; }
      h1 { font-size: 22px; border-bottom: 2px solid #2563eb; padding-bottom: 8px; color: #1e293b; }
      h2 { font-size: 16px; color: #334155; margin-top: 24px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
      table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
      th { background: #f1f5f9; text-align: left; padding: 8px 10px; border: 1px solid #e2e8f0; font-weight: 600; }
      td { padding: 8px 10px; border: 1px solid #e2e8f0; }
      .metric { display: inline-block; width: 48%; margin-bottom: 8px; }
      .label { color: #64748b; font-size: 12px; }
      .value { font-size: 18px; font-weight: 700; color: #1e293b; }
      .ma-change { border-left: 3px solid #7c3aed; padding-left: 8px; margin: 6px 0; }
      @media print { body { margin: 20px; } .no-print { display: none; } svg { max-width: 100%; } }
    </style></head><body>
    <div class="no-print" style="background:#2563eb;color:#fff;padding:12px 20px;border-radius:8px;margin-bottom:20px;text-align:center;font-weight:600;">
      Neuro-Stimulation Voiding Diary — Report Preview
    </div>
    <h1>Neuro-Stimulation Voiding Diary Report</h1>
    ${providerConfig && providerConfig.preparedFor ? `
    <div style="margin:12px 0 16px;padding:14px 18px;background:#f0f9ff;border:1px solid #bfdbfe;border-radius:8px;">
      <div style="font-size:13px;color:#334155;line-height:1.8;">
        This prototype has been prepared specifically for <strong>${providerConfig.preparedFor.replace(/</g,'&lt;')}</strong>
        by Dr. <strong>${providerConfig.preparedBy.replace(/</g,'&lt;')}</strong>.
        This configuration has been reviewed by <strong>${providerConfig.reviewedBy.replace(/</g,'&lt;')}</strong>.
      </div>
      <div style="font-size:12px;color:#64748b;margin-top:6px;">
        If you have questions or concerns, please contact <strong>${providerConfig.contact.replace(/</g,'&lt;')}</strong>.
      </div>
    </div>
    ` : ''}
    <p style="color:#64748b;font-size:13px;">
      Report Period: ${new Date(dateRange.from+"T00:00:00").toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}
      – ${new Date(dateRange.to+"T00:00:00").toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}
      &nbsp;(${totalDays} days)
      ${hasFilters ? `<br/><strong style="color:#f59e0b;">Filtered: ${filterDesc}</strong> (${rpt.length} of ${records.length} records)` : ""}
      <br/>Generated: ${new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}
    </p>

    ${notesHtml}

    <h2>Summary Metrics</h2>
    <div>
      <div class="metric"><div class="label">Total Voids</div><div class="value">${rpt.length}${hasFilters ? ` / ${records.length}` : ""}</div></div>
      <div class="metric"><div class="label">Voids / Day</div><div class="value">${voidsPerDay}</div></div>
      <div class="metric"><div class="label">Night Voids</div><div class="value">${nightVoids} (${nightVoidsPerDay}/day)</div></div>
      <div class="metric"><div class="label">Accidents</div><div class="value">${accidentCount}${minorCount > 0 ? ` (${minorCount} minor)` : ""}</div></div>
      <div class="metric"><div class="label">Avg Volume</div><div class="value">${avgVolume} ml</div></div>
      <div class="metric"><div class="label">Volume Range</div><div class="value">${minVol}–${maxVol} ml</div></div>
      <div class="metric"><div class="label">Avg Initial Urge</div><div class="value">${avgInitUrge} / 4</div></div>
      <div class="metric"><div class="label">Avg Final Urge</div><div class="value">${avgFinalUrge} / 4</div></div>
      <div class="metric"><div class="label">Avg Deferral</div><div class="value">${avgDeferral}${avgDeferral !== "N/A" ? " min" : ""}</div></div>
      <div class="metric"><div class="label">Tolerance Met</div><div class="value">${tolerancePct}% (target: ${targetDef} min)</div></div>
      <div class="metric"><div class="label">Current mA</div><div class="value">${currentMa} mA</div></div>
      <div class="metric"><div class="label">Avg Daily Fluid In</div><div class="value">${avgDailyFluid !== "—" ? avgDailyFluid + " ml" + (fluidPartial ? "*" : "") : "—"}</div></div>
    </div>

    ${fluidPartial ? `<p style="font-size:11px;color:#64748b;margin-top:4px;">* Average computed from days with recorded data only (${daysWithFluid} of ${totalDays} days). Fluid intake tracking was not available for the full report period.</p>` : ""}
    <h2>Stimulation Setting History</h2>
    ${maHistory.length > 0 ? maHistory.map(h =>
      `<div class="ma-change"><strong>${h.mA} mA</strong> (${h.mode}) — ${new Date(h.date+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}${h.time ? " at " + fmtTime(h.time) : ""} <span style="font-size:12px;color:#64748b;">${h.notes || ""}</span></div>`
    ).join("") : "<p>No changes recorded</p>"}

    <h2>Charts</h2>
    ${volMaChart}
    ${makeBarChart("Daily Voids & Night Wakes", chartData, "count", "#60a5fa", "wakes", "#8b5cf6")}
    ${hasFluid ? fluidChart : ''}
    ${urgeScatterChart}

    <h2>Daily Summary</h2>
    <table>
      <tr><th>Date</th><th>Voids</th><th>Void Vol (ml)</th><th>Fluid In (ml)</th><th>Night Voids</th><th>Meals</th></tr>
      ${Object.keys(byDate).sort().map(d => {
        const dd = byDate[d];
        return `<tr><td>${new Date(d+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})}</td><td>${dd.count}</td><td>${dd.vol}</td><td>${dd.fluidIn || ""}</td><td>${dd.nightCount}</td><td>${dd.meals || ""}</td></tr>`;
      }).join("")}
    </table>

    ${intakes.length > 0 ? `<h2>Intake Log</h2>
    <table>
      <tr><th>Date</th><th>Time</th><th>Type</th><th>Item</th><th>Amount (ml)</th><th>Size</th><th>Notes</th></tr>
      ${[...intakes].sort((a,b) => (a.date+a.time).localeCompare(b.date+b.time)).map(i =>
        `<tr><td>${new Date(i.date+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})}</td>
        <td>${i.time || ""}</td><td>${i.category}</td><td>${i.subtype}</td>
        <td>${i.amount || ""}</td><td>${i.mealSize || ""}</td><td style="font-size:11px">${i.notes || ""}</td></tr>`
      ).join("")}
    </table>` : ""}

    <h2>Full Voiding Log</h2>
    <table>
      <tr><th>Date</th><th>Time</th><th>Vol</th><th>Type</th><th>Acc</th><th>Urge</th><th>Def</th><th>Mode</th><th>mA</th><th>Notes</th></tr>
      ${rpt.map(r =>
        `<tr><td>${new Date(r.date+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})}</td>
        <td>${r.time || ""}</td><td>${r.volume}</td><td>${r.type}</td>
        <td>${r.accident}</td><td>${safeNum(r.initUrge).toFixed(1)}→${safeNum(r.finalUrge).toFixed(1)}</td>
        <td>${r.deferral || ""}</td><td>${r.mode}</td><td>${r.mA}</td>
        <td style="max-width:150px;font-size:11px">${r.notes || ""}</td></tr>`
      ).join("")}
    </table>

    <div style="margin-top:30px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;">
      Neuro-Stim Voiding Diary · Patient Self-Report · v${APP_VERSION}
    </div>
    </body></html>`;

    try { onShowReport(html); }
    catch (e) { console.error("Report export error:", e); showToast("Export failed"); }
  };

  return (
    <>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>Doctor Report</div>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: hasFilters ? 6 : 16 }}>
        {fmt(dateRange.from)} – {fmt(dateRange.to)} · {totalDays} days · {rpt.length} records
      </div>
      {hasFilters && (
        <div style={{
          fontSize: 12, color: "#f59e0b", marginBottom: 12,
          padding: "6px 10px", borderRadius: 8,
          background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)",
        }}>
          Filtered: {filterDesc} ({rpt.length} of {records.length} records)
          <button onClick={() => onFiltersChange(DEFAULT_FILTERS)} style={{
            marginLeft: 8, padding: "2px 8px", borderRadius: 6, border: "none",
            background: "rgba(245,158,11,0.2)", color: "#f59e0b",
            fontSize: 11, cursor: "pointer",
          }}>Clear</button>
        </div>
      )}

      {/* Quick metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
        {[
          { l: "Voids/Day", v: voidsPerDay },
          { l: "Avg Vol", v: `${avgVolume}ml` },
          { l: "Night/Day", v: nightVoidsPerDay },
          { l: "Accidents", v: accidentCount },
          { l: "Avg Urge", v: `${avgInitUrge}/4` },
          { l: "Current mA", v: currentMa },
          { l: "Avg Fluid", v: avgDailyFluid !== "—" ? `${avgDailyFluid}ml` : "—" },
          { l: "Tolerance", v: `${tolerancePct}%` },
        ].map(m => (
          <div key={m.l} style={{ padding: "10px 8px", borderRadius: 10, background: "rgba(30,41,59,0.6)", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "#8a9ab5", textTransform: "uppercase", letterSpacing: 0.5 }}>{m.l}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0", fontFamily: "'DM Mono', monospace", marginTop: 2 }}>{m.v}</div>
          </div>
        ))}
      </div>

      {/* ── Doctor Comments Journal (NEW) ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>
          Comments & Questions for Doctor
        </div>
        <textarea value={noteText} onChange={e => setNoteText(e.target.value)}
          rows={3} placeholder="Write a comment or question for your doctor..."
          style={{ ...inputStyle, resize: "vertical", minHeight: 60, marginBottom: 8 }} />
        <button onClick={addNote} disabled={!noteText.trim()} style={{
          width: "100%", padding: 10, borderRadius: 10, border: "none",
          background: noteText.trim() ? "rgba(59,130,246,0.2)" : "rgba(100,120,160,0.08)",
          color: noteText.trim() ? "#60a5fa" : "#475569",
          fontSize: 13, fontWeight: 600, cursor: noteText.trim() ? "pointer" : "default",
          marginBottom: 10,
        }}>+ Add Note</button>

        {doctorNotes.length > 0 && [...doctorNotes].reverse().map(n => (
          <div key={n.id} style={{
            padding: "10px 12px", borderRadius: 10, background: "rgba(30,41,59,0.4)",
            marginBottom: 6, borderLeft: "3px solid #3b82f6",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "#64748b" }}>{fmt(n.date)} at {fmtTime(n.time)}</div>
                <div style={{ fontSize: 13, color: "#e2e8f0", marginTop: 4, whiteSpace: "pre-wrap" }}>{n.text}</div>
              </div>
              <button onClick={() => deleteNote(n.id)} style={{
                padding: "2px 6px", borderRadius: 6, border: "none",
                background: "rgba(239,68,68,0.1)", color: "#ef4444",
                fontSize: 10, cursor: "pointer", marginLeft: 8, flexShrink: 0,
              }}>✕</button>
            </div>
          </div>
        ))}
      </div>

      {/* mA History */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Stimulation Changes</div>
        {maHistory.map((h, i) => (
          <div key={i} style={{
            padding: "8px 12px", borderRadius: 8, background: "rgba(30,41,59,0.4)",
            marginBottom: 4, borderLeft: "3px solid #a78bfa",
            display: "flex", justifyContent: "space-between",
          }}>
            <span style={{ color: "#94a3b8", fontSize: 12 }}>
              {new Date(h.date+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})}
              {h.time && <span style={{ color: "#64748b" }}> {fmtTime(h.time)}</span>}
            </span>
            <span style={{ fontSize: 12 }}>
              <span style={{ color: "#a78bfa", fontWeight: 700 }}>{h.mA} mA</span>
              <span style={{ color: "#64748b" }}> · {h.notes || h.mode}</span>
            </span>
          </div>
        ))}
      </div>

      {/* Generate/Export buttons */}
      <button onClick={printReport} style={{
        width: "100%", padding: 16, borderRadius: 14, border: "none",
        background: "linear-gradient(135deg, #3b82f6, #2563eb)",
        color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer",
        fontFamily: "'DM Sans', sans-serif",
        boxShadow: "0 4px 20px rgba(59,130,246,0.4)", marginBottom: 10,
      }}>View Full Report</button>

      <button onClick={() => exportCSV(rpt)} style={{
        width: "100%", padding: 14, borderRadius: 12, border: "none",
        background: "rgba(96,165,250,0.15)", color: "#60a5fa",
        fontSize: 15, fontWeight: 600, cursor: "pointer",
        fontFamily: "'DM Sans', sans-serif",
      }}>Export Data as CSV</button>

      <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: "rgba(30,41,59,0.4)", fontSize: 12, color: "#64748b" }}>
        "View Full Report" opens a formatted report with charts. Notes and comments appear prominently at the top.
      </div>
      <div style={{ height: 40 }} />
    </>
  );
};
