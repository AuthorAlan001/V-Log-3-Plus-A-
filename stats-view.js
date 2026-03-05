// ═══════════════════════════════════════════════════
// STATS-VIEW.JS — Charts & Clinical Summary
// Scatter plot urge chart, tolerance, volume
// V Log Plus v3.1.0
// ═══════════════════════════════════════════════════

const { ResponsiveContainer, ComposedChart, LineChart, Line, BarChart, Bar, ScatterChart, Scatter,
        XAxis, YAxis, ZAxis, Tooltip, CartesianGrid, Legend, ReferenceLine } = Recharts;

window.StatsView = function StatsView({ records, settings, maHistory, intakes }) {
  const totalVoids = records.length;
  const avgVol = records.length ? (records.reduce((s, r) => s + safeNum(r.volume), 0) / records.length).toFixed(0) : 0;
  const accidents = records.filter(r => r.accident === "Yes" || r.accident === "Minor").length;
  const avgUrge = records.length ? (records.reduce((s, r) => s + safeNum(r.initUrge), 0) / records.length).toFixed(1) : 0;

  // Build daily aggregation
  const byDate = {};
  records.forEach(r => {
    const d = r.date;
    if (!byDate[d]) byDate[d] = { date: d, count: 0, vol: 0, urgeSum: 0, finalUrgeSum: 0, accidents: 0, wakes: 0, mA: safeNum(r.mA, 0.7), fluidIn: 0 };
    byDate[d].count++;
    byDate[d].vol += safeNum(r.volume);
    byDate[d].urgeSum += safeNum(r.initUrge);
    byDate[d].finalUrgeSum += safeNum(r.finalUrge);
    if (r.accident !== "No") byDate[d].accidents++;
    if (r.wokeMe === "Yes") byDate[d].wakes++;
    byDate[d].mA = safeNum(r.mA, byDate[d].mA);
  });
  intakes.forEach(i => {
    if (i.category === "Drink") {
      const d = i.date;
      if (!byDate[d]) byDate[d] = { date: d, count: 0, vol: 0, urgeSum: 0, finalUrgeSum: 0, accidents: 0, wakes: 0, mA: settings.mA, fluidIn: 0 };
      byDate[d].fluidIn += safeNum(i.amount);
    }
  });
  const dailyData = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)).map(d => ({
    ...d,
    avgInitUrge: d.count > 0 ? +(d.urgeSum / d.count).toFixed(1) : 0,
    avgFinalUrge: d.count > 0 ? +(d.finalUrgeSum / d.count).toFixed(1) : 0,
    label: new Date(d.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  }));

  // Per-record timeline
  const timelineData = records.map(r => ({
    label: new Date(r.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " + (r.time || ""),
    volume: safeNum(r.volume),
    initUrge: safeNum(r.initUrge),
    finalUrge: safeNum(r.finalUrge),
    deferral: safeNum(r.deferral),
    mA: safeNum(r.mA, 0.7),
  }));

  // Tolerance stats
  const targetDef = safeNum(settings.targetDeferral, 5);
  const deferralsWithValues = records.filter(r => safeNum(r.deferral) > 0);
  const toleranceMet = deferralsWithValues.filter(r => safeNum(r.deferral) >= targetDef).length;
  const tolerancePct = deferralsWithValues.length > 0 ? Math.round((toleranceMet / deferralsWithValues.length) * 100) : 0;

  return (
    <>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0", marginBottom: 16 }}>Clinical Summary</div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Total Voids", val: totalVoids, unit: "", color: "#60a5fa" },
          { label: "Avg Volume", val: avgVol, unit: "ml", color: "#22c55e" },
          { label: "Avg Init Urge", val: avgUrge, unit: "/4", color: "#f59e0b" },
          { label: "Accidents", val: accidents, unit: "", color: accidents > 0 ? "#ef4444" : "#22c55e" },
          { label: "Current mA", val: settings.mA, unit: "mA", color: "#a78bfa" },
          { label: "Night Wakes", val: records.filter(r => r.wokeMe === "Yes").length, unit: "", color: "#8b5cf6" },
          { label: "Tolerance Met", val: tolerancePct, unit: "%", color: tolerancePct >= 70 ? "#22c55e" : tolerancePct >= 40 ? "#f59e0b" : "#ef4444" },
          { label: "Target Deferral", val: targetDef, unit: "min", color: "#60a5fa" },
        ].map(s => (
          <div key={s.label} style={{
            padding: 16, borderRadius: 14, background: "rgba(30,41,59,0.6)",
            border: `1px solid ${s.color}22`,
          }}>
            <div style={{ fontSize: 11, color: "#8a9ab5", textTransform: "uppercase", letterSpacing: 1 }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color, fontFamily: "'DM Mono', monospace", marginTop: 4 }}>
              {s.val}<span style={{ fontSize: 12, color: "#64748b" }}>{s.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Chart: Daily Total Volume with mA overlay */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Daily Volume & mA Setting</div>
        <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: 14, padding: "12px 4px 4px 0" }}>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,120,160,0.15)" />
              <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} />
              <YAxis yAxisId="vol" tick={{ fill: "#64748b", fontSize: 10 }} width={40} />
              <YAxis yAxisId="ma" orientation="right" domain={[0, 3]} tick={{ fill: "#a78bfa", fontSize: 10 }} width={35} />
              <Tooltip {...chartTooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
              <Bar yAxisId="vol" dataKey="vol" fill="#22c55e" radius={[4, 4, 0, 0]} name="Volume (ml)" />
              <Line yAxisId="ma" type="stepAfter" dataKey="mA" stroke="#a78bfa" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3, fill: "#a78bfa" }} name="mA" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Chart: Daily Void Count & Night Wakes */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Daily Voids & Night Wakes</div>
        <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: 14, padding: "12px 4px 4px 0" }}>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,120,160,0.15)" />
              <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} />
              <YAxis tick={{ fill: "#64748b", fontSize: 10 }} width={30} />
              <Tooltip {...chartTooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
              <Bar dataKey="count" fill="#60a5fa" radius={[4, 4, 0, 0]} name="Voids" />
              <Bar dataKey="wakes" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Night Wakes" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Chart: Fluid In vs Void Out */}
      {dailyData.some(d => d.fluidIn > 0) && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Fluid In vs Void Out (ml)</div>
          <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: 14, padding: "12px 4px 4px 0" }}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,120,160,0.15)" />
                <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} />
                <YAxis tick={{ fill: "#64748b", fontSize: 10 }} width={40} />
                <Tooltip {...chartTooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                <Bar dataKey="fluidIn" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Fluid In" />
                <Bar dataKey="vol" fill="#22c55e" radius={[4, 4, 0, 0]} name="Void Out" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Urge Trend: Scatter Plot (Daily Avg Initial vs Final) ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>Daily Avg Urge: Initial vs Final</div>
        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>
          <span style={{ color: "#3b82f6" }}>▲ Avg Initial</span> &nbsp;
          <span style={{ color: "#f97316" }}>■ Avg Final</span> &nbsp;
          Lower orange = better resolution
        </div>
        <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: 14, padding: "12px 4px 4px 0" }}>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,120,160,0.15)" />
              <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} />
              <YAxis domain={[0, 4]} ticks={[0, 1, 2, 3, 4]}
                tick={{ fill: "#64748b", fontSize: 10 }} width={25} />
              <Tooltip {...chartTooltipStyle}
                formatter={(value, name) => [safeNum(value).toFixed(1), name]}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
              <Scatter dataKey="avgInitUrge" name="Avg Initial" fill="#3b82f6"
                shape={(props) => {
                  const { cx, cy } = props;
                  return <polygon points={`${cx},${cy-7} ${cx-7},${cy+5} ${cx+7},${cy+5}`}
                    fill="#3b82f6" stroke="#2563eb" strokeWidth={1} />;
                }}
              />
              <Scatter dataKey="avgFinalUrge" name="Avg Final" fill="#f97316"
                shape={(props) => {
                  const { cx, cy } = props;
                  return <rect x={cx-5} y={cy-5} width={10} height={10}
                    fill="#f97316" stroke="#ea580c" strokeWidth={1} />;
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── NEW: Deferral vs Tolerance Target ── */}
      {deferralsWithValues.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>
            Deferral vs Target ({targetDef} min)
          </div>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>
            {toleranceMet}/{deferralsWithValues.length} met target ({tolerancePct}%)
          </div>
          <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: 14, padding: "12px 4px 4px 0" }}>
            <ResponsiveContainer width="100%" height={180}>
              <ComposedChart data={timelineData.filter(d => d.deferral > 0)}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,120,160,0.15)" />
                <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 9 }} interval={Math.max(0, Math.floor(deferralsWithValues.length / 6))} />
                <YAxis tick={{ fill: "#64748b", fontSize: 10 }} width={30} />
                <Tooltip {...chartTooltipStyle} />
                <ReferenceLine y={targetDef} stroke="#f59e0b" strokeDasharray="5 3" strokeWidth={2}
                  label={{ value: `Target: ${targetDef}min`, fill: "#f59e0b", fontSize: 10, position: "insideTopRight" }} />
                <Bar dataKey="deferral" name="Deferral (min)"
                  shape={(props) => {
                    const { x, y, width, height, payload } = props;
                    const met = payload.deferral >= targetDef;
                    return <rect x={x} y={y} width={width} height={height}
                      fill={met ? "#22c55e" : "#ef4444"} rx={4} opacity={0.8} />;
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Chart: Volume per void with mA overlay */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Volume per Void & mA Setting</div>
        <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: 14, padding: "12px 4px 4px 0" }}>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={timelineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,120,160,0.15)" />
              <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 9 }} interval={Math.max(0, Math.floor(timelineData.length / 6))} />
              <YAxis yAxisId="vol" tick={{ fill: "#64748b", fontSize: 10 }} width={40} />
              <YAxis yAxisId="ma" orientation="right" domain={[0, 3]} tick={{ fill: "#a78bfa", fontSize: 10 }} width={35} />
              <Tooltip {...chartTooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
              <Line yAxisId="vol" type="monotone" dataKey="volume" stroke="#22c55e" strokeWidth={2} dot={{ r: 3, fill: "#22c55e" }} name="Volume (ml)" />
              <Line yAxisId="ma" type="stepAfter" dataKey="mA" stroke="#a78bfa" strokeWidth={2} strokeDasharray="5 3" dot={false} name="mA" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Daily breakdown table */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Daily Breakdown</div>
        {dailyData.slice().reverse().map(d => (
          <div key={d.date} style={{
            display: "flex", justifyContent: "space-between", padding: "10px 12px",
            borderRadius: 10, background: "rgba(30,41,59,0.4)", marginBottom: 6,
          }}>
            <span style={{ color: "#94a3b8", fontSize: 13 }}>{d.label}</span>
            <span style={{ color: "#e2e8f0", fontSize: 13, fontFamily: "'DM Mono', monospace" }}>
              {d.count} voids · {d.vol}ml
              {d.wakes > 0 && <span style={{ color: "#8b5cf6" }}> · {d.wakes}w</span>}
              {d.accidents > 0 && <span style={{ color: "#ef4444" }}> · {d.accidents}acc</span>}
              {d.fluidIn > 0 && <span style={{ color: "#3b82f6" }}> · {d.fluidIn}ml in</span>}
            </span>
          </div>
        ))}
      </div>

      {/* mA Settings History */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>mA Settings History</div>
        {maHistory.map((h, i) => (
          <div key={i} style={{
            display: "flex", justifyContent: "space-between", padding: "10px 12px",
            borderRadius: 10, background: "rgba(30,41,59,0.4)", marginBottom: 6,
            borderLeft: "3px solid #a78bfa",
          }}>
            <span style={{ color: "#94a3b8", fontSize: 13 }}>
              {new Date(h.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
            <span style={{ color: "#e2e8f0", fontSize: 13, fontFamily: "'DM Mono', monospace" }}>
              <span style={{ color: "#a78bfa", fontWeight: 700 }}>{h.mA} mA</span>
              <span style={{ color: "#64748b" }}> · {h.mode}</span>
            </span>
          </div>
        ))}
        {maHistory.length === 0 && <div style={{ color: "#64748b", fontSize: 13 }}>No changes recorded</div>}
      </div>
      <div style={{ height: 40 }} />
    </>
  );
};
