// ═══════════════════════════════════════════════════
// SETTINGS-VIEW.JS — App Settings & Data Management
// ═══════════════════════════════════════════════════

// Chime repeat interval presets (seconds)
const CHIME_INTERVAL_OPTIONS = [
  { label: "15s", value: 15 },
  { label: "30s", value: 30 },
  { label: "45s", value: 45 },
  { label: "60s", value: 60 },
];

window.SettingsView = function SettingsView({
  settings, onUpdateSettings, maHistory, onMaHistoryChange, records, onRecordsChange,
  intakes, onIntakesChange, showToast, onStartNew,
}) {
  const [editingMa, setEditingMa] = useState(null);
  const [maForm, setMaForm] = useState({ date: "", mA: 0.7, mode: "Awake", notes: "" });

  const updateSetting = async (key, val) => {
    const s = { ...settings, [key]: val };
    onUpdateSettings(s);
    await saveSettings(s);
  };

  // Effective volume display (master × timer, as percentage)
  const effectivePercent = Math.round(
    (safeNum(settings.masterVolume, 70) / 100) * (safeNum(settings.timerVolume, 100) / 100) * 100
  );

  return (
    <>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0", marginBottom: 16 }}>Settings</div>

      <Field label={`Default mA: ${settings.mA}`}>
        <input type="range" min="0" max="3" step="0.1" value={settings.mA}
          onChange={e => updateSetting("mA", parseFloat(e.target.value))}
          style={{ width: "100%", accentColor: "#60a5fa" }} />
      </Field>

      <Field label="Default Mode">
        <PillSelect options={CONFIG.modes} value={settings.mode}
          onChange={v => updateSetting("mode", v)}
          color={settings.mode === "Asleep" ? "#8b5cf6" : "#60a5fa"} />
      </Field>

      {/* ── Void Tolerance Target ── */}
      <Field label={`Deferral Target: ${safeNum(settings.targetDeferral, 5)} minutes`}>
        <input type="range" min="1" max="30" step="1" value={safeNum(settings.targetDeferral, 5)}
          onChange={e => updateSetting("targetDeferral", parseInt(e.target.value))}
          style={{ width: "100%", accentColor: "#f59e0b" }} />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
          <span style={{ fontSize: 10, color: "#64748b" }}>1 min</span>
          <span style={{ fontSize: 10, color: "#64748b" }}>30 min</span>
        </div>
        <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>
          Used in charts and the Track Urge timer to measure tolerance progress.
        </div>
      </Field>

      {/* ═══ SOUND & NOTIFICATIONS ═══ */}
      <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid rgba(100,120,160,0.15)" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0", marginBottom: 12 }}>
          Sound & Notifications
        </div>

        {/* Master Volume */}
        <Field label={`Master Volume: ${safeNum(settings.masterVolume, 70)}%`}>
          <input type="range" min="0" max="100" step="5" value={safeNum(settings.masterVolume, 70)}
            onChange={e => updateSetting("masterVolume", parseInt(e.target.value))}
            style={{ width: "100%", accentColor: "#60a5fa" }} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
            <span style={{ fontSize: 10, color: "#64748b" }}>Off</span>
            <span style={{ fontSize: 10, color: "#64748b" }}>100%</span>
          </div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>
            Controls all app sounds — chimes, future alerts, and rewards.
          </div>
        </Field>

        {/* Timer Chime Volume Override */}
        <Field label={`Timer Chime Volume: ${safeNum(settings.timerVolume, 100)}%`}>
          <input type="range" min="0" max="100" step="5" value={safeNum(settings.timerVolume, 100)}
            onChange={e => updateSetting("timerVolume", parseInt(e.target.value))}
            style={{ width: "100%", accentColor: "#f59e0b" }} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
            <span style={{ fontSize: 10, color: "#64748b" }}>Off</span>
            <span style={{ fontSize: 10, color: "#64748b" }}>100%</span>
          </div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>
            Relative to master volume. Effective level: <strong style={{ color: "#e2e8f0" }}>{effectivePercent}%</strong>
          </div>
        </Field>

        {/* Chime Repeat Interval */}
        <Field label={`Repeat Interval: every ${safeNum(settings.chimeRepeatInterval, 30)}s`}>
          <div style={{ display: "flex", gap: 6 }}>
            {CHIME_INTERVAL_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => updateSetting("chimeRepeatInterval", opt.value)}
                style={{
                  flex: 1, padding: "8px 0", borderRadius: 8, border: "none",
                  background: safeNum(settings.chimeRepeatInterval, 30) === opt.value
                    ? "#60a5fa" : "rgba(100,120,160,0.12)",
                  color: safeNum(settings.chimeRepeatInterval, 30) === opt.value
                    ? "#fff" : "#94a3b8",
                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}>{opt.label}</button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 6 }}>
            How often the chime repeats after a countdown timer expires. Interval shortens as escalation builds.
          </div>
        </Field>

        {/* Chime Repeat Duration */}
        <Field label={`Repeat Duration: ${safeNum(settings.chimeRepeatDuration, 2) === 0 ? "Single chime (no repeat)" : safeNum(settings.chimeRepeatDuration, 2) + " min"}`}>
          <input type="range" min="0" max="10" step="1" value={safeNum(settings.chimeRepeatDuration, 2)}
            onChange={e => updateSetting("chimeRepeatDuration", parseInt(e.target.value))}
            style={{ width: "100%", accentColor: "#f59e0b" }} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
            <span style={{ fontSize: 10, color: "#64748b" }}>Off</span>
            <span style={{ fontSize: 10, color: "#64748b" }}>10 min</span>
          </div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>
            How long the chime repeats (escalating in volume and frequency). Set to 0 for a single chime only.
          </div>
        </Field>

        {/* Test Chime Button */}
        <button onClick={() => {
          if (window.playTestChime) {
            window.playTestChime(settings);
            showToast("Chime played at " + effectivePercent + "% volume");
          } else {
            showToast("Audio not available");
          }
        }} style={{
          width: "100%", padding: 12, borderRadius: 12, border: "1px solid rgba(96,165,250,0.3)",
          background: "rgba(96,165,250,0.08)", color: "#60a5fa",
          fontSize: 14, fontWeight: 600, cursor: "pointer",
          fontFamily: "'DM Sans', sans-serif",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          <span style={{ fontSize: 18 }}>🔔</span> Test Chime
        </button>
      </div>

      {/* ═══ mA History Editor ═══ */}
      <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid rgba(100,120,160,0.15)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>mA History</div>
          <button onClick={() => {
            setEditingMa("new");
            setMaForm({ date: localDate(), mA: settings.mA, mode: settings.mode, notes: "" });
          }} style={{
            padding: "5px 12px", borderRadius: 8, border: "none",
            background: "rgba(96,165,250,0.15)", color: "#60a5fa",
            fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>+ Add</button>
        </div>

        {maHistory.map((h, i) => (
          <div key={i} style={{
            padding: "10px 12px", borderRadius: 10, background: "rgba(30,41,59,0.4)",
            marginBottom: 6, borderLeft: "3px solid #a78bfa",
          }}>
            {editingMa === i ? (
              <div>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input type="date" value={maForm.date} onChange={e => setMaForm(f => ({...f, date: e.target.value}))}
                    style={{ ...inputStyle, flex: 1, padding: "6px 8px", fontSize: 13 }} />
                  <input type="number" step="0.1" value={maForm.mA}
                    onChange={e => setMaForm(f => ({...f, mA: parseFloat(e.target.value) || 0}))}
                    style={{ ...inputStyle, width: 70, padding: "6px 8px", fontSize: 13 }} />
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <PillSelect options={CONFIG.modes} value={maForm.mode}
                    onChange={v => setMaForm(f => ({...f, mode: v}))}
                    color={maForm.mode === "Asleep" ? "#8b5cf6" : "#60a5fa"} />
                </div>
                <input value={maForm.notes} onChange={e => setMaForm(f => ({...f, notes: e.target.value}))}
                  placeholder="Notes..." style={{ ...inputStyle, padding: "6px 8px", fontSize: 13, marginBottom: 8 }} />
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={async () => {
                    const updated = maHistory.map((m, j) => j === i ? {...maForm} : m);
                    updated.sort((a, b) => a.date.localeCompare(b.date));
                    onMaHistoryChange(updated);
                    await saveMaHistory(updated);
                    setEditingMa(null);
                    showToast("mA entry updated");
                  }} style={{ flex: 1, padding: 8, borderRadius: 8, border: "none", background: "#22c55e", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Save</button>
                  <button onClick={async () => {
                    const updated = maHistory.filter((_, j) => j !== i);
                    onMaHistoryChange(updated);
                    await saveMaHistory(updated);
                    setEditingMa(null);
                    showToast("mA entry deleted");
                  }} style={{ padding: 8, borderRadius: 8, border: "none", background: "rgba(239,68,68,0.15)", color: "#ef4444", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Delete</button>
                  <button onClick={() => setEditingMa(null)} style={{ padding: 8, borderRadius: 8, border: "none", background: "rgba(100,120,160,0.12)", color: "#94a3b8", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div onClick={() => { setEditingMa(i); setMaForm({...h}); }}
                style={{ display: "flex", justifyContent: "space-between", cursor: "pointer" }}>
                <span style={{ color: "#94a3b8", fontSize: 13 }}>
                  {new Date(h.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
                <span style={{ fontSize: 13 }}>
                  <span style={{ color: "#a78bfa", fontWeight: 700 }}>{h.mA} mA</span>
                  <span style={{ color: "#64748b" }}> · {h.mode}</span>
                  {h.notes && <span style={{ color: "#475569" }}> · {h.notes}</span>}
                </span>
              </div>
            )}
          </div>
        ))}

        {/* New mA entry form */}
        {editingMa === "new" && (
          <div style={{
            padding: "10px 12px", borderRadius: 10, background: "rgba(30,41,59,0.4)",
            marginBottom: 6, borderLeft: "3px solid #22c55e",
          }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input type="date" value={maForm.date} onChange={e => setMaForm(f => ({...f, date: e.target.value}))}
                style={{ ...inputStyle, flex: 1, padding: "6px 8px", fontSize: 13 }} />
              <input type="number" step="0.1" value={maForm.mA}
                onChange={e => setMaForm(f => ({...f, mA: parseFloat(e.target.value) || 0}))}
                style={{ ...inputStyle, width: 70, padding: "6px 8px", fontSize: 13 }} />
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <PillSelect options={CONFIG.modes} value={maForm.mode}
                onChange={v => setMaForm(f => ({...f, mode: v}))}
                color={maForm.mode === "Asleep" ? "#8b5cf6" : "#60a5fa"} />
            </div>
            <input value={maForm.notes} onChange={e => setMaForm(f => ({...f, notes: e.target.value}))}
              placeholder="Notes..." style={{ ...inputStyle, padding: "6px 8px", fontSize: 13, marginBottom: 8 }} />
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={async () => {
                const updated = [...maHistory, {...maForm}].sort((a, b) => a.date.localeCompare(b.date));
                onMaHistoryChange(updated);
                await saveMaHistory(updated);
                setEditingMa(null);
                showToast("mA entry added");
              }} style={{ flex: 1, padding: 8, borderRadius: 8, border: "none", background: "#22c55e", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Add</button>
              <button onClick={() => setEditingMa(null)} style={{ padding: 8, borderRadius: 8, border: "none", background: "rgba(100,120,160,0.12)", color: "#94a3b8", fontSize: 13, cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        )}

        <div style={{ fontSize: 11, color: "#475569", marginTop: 6 }}>
          Tap any entry to edit or delete it. Changes are also tracked automatically when you save a record with a different mA value.
        </div>
      </div>

      {/* ═══ Data Management ═══ */}
      <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid rgba(100,120,160,0.15)" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0", marginBottom: 10 }}>Data</div>
        <button onClick={() => exportCSV(records)} style={{
          width: "100%", padding: 14, borderRadius: 12, border: "none",
          background: "rgba(96,165,250,0.15)", color: "#60a5fa",
          fontSize: 15, fontWeight: 600, cursor: "pointer", marginBottom: 10,
          fontFamily: "'DM Sans', sans-serif",
        }}>Export All Records (CSV)</button>

        <button onClick={() => {
          if (intakes.length === 0) { showToast("No intake records"); return; }
          const headers = ["Date","Time","Category","Type","Amount (ml)","Size","Notes"];
          const rows = intakes.map(i => [i.date, i.time, i.category, i.subtype, i.amount, i.mealSize || "", `"${(i.notes||"").replace(/"/g,'""')}"`]);
          const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
          const blob = new Blob([csv], { type: "text/csv" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url; a.download = `neuro-log-intakes-${new Date().toISOString().slice(0,10)}.csv`;
          a.click(); URL.revokeObjectURL(url);
        }} style={{
          width: "100%", padding: 14, borderRadius: 12, border: "none",
          background: "rgba(249,115,22,0.1)", color: "#f97316",
          fontSize: 15, fontWeight: 600, cursor: "pointer", marginBottom: 10,
          fontFamily: "'DM Sans', sans-serif",
        }}>Export Intake Log (CSV)</button>

        <button onClick={async () => {
          if (window.confirm("Import Intake Log? This adds records without removing existing ones.")) {
            const input = document.createElement("input");
            input.type = "file"; input.accept = ".csv";
            input.style.display = "none";
            document.body.appendChild(input);
            input.onchange = async (e) => {
              const text = await e.target.files[0].text();
              const lines = text.split("\n").slice(1).filter(l => l.trim());
              const imported = lines.map(line => {
                const cols = line.split(",");
                return {
                  id: Date.now().toString() + Math.random().toString(36).slice(2),
                  date: cols[0] ? cols[0].slice(0, 10) : "",
                  time: cols[1] || "",
                  category: cols[2] || "Drink",
                  subtype: cols[3] || "",
                  amount: cols[4] || "",
                  mealSize: cols[5] || "",
                  notes: (cols[6] || "").replace(/^"|"$/g, "").replace(/""/g, '"'),
                };
              });
              const existing = await loadIntakes();
              const updated = [...existing, ...imported];
              await saveIntakes(updated);
              if (onIntakesChange) onIntakesChange(updated);
              showToast(`Imported ${imported.length} intake records`);
              document.body.removeChild(input);
            };
            input.click();
          }
        }} style={{
          width: "100%", padding: 14, borderRadius: 12, border: "none",
          background: "rgba(249,115,22,0.1)", color: "#f97316",
          fontSize: 15, fontWeight: 600, cursor: "pointer", marginBottom: 10,
          fontFamily: "'DM Sans', sans-serif",
        }}>Import Intake Log (CSV)</button>

        <button onClick={async () => {
          if (window.confirm("Import your existing spreadsheet data? This adds records without removing existing ones.")) {
            const input = document.createElement("input");
            input.type = "file"; input.accept = ".csv";
            input.style.display = "none";
            document.body.appendChild(input);
            input.onchange = async (e) => {
              const text = await e.target.files[0].text();
              const lines = text.split("\n").slice(1).filter(l => l.trim());
              const imported = lines.map(line => {
                const cols = line.split(",");
                return {
                  id: cols[0] || Date.now().toString(),
                  date: cols[1] ? cols[1].slice(0, 10) : "",
                  time: cols[2] || "",
                  volume: cols[3] || "",
                  type: cols[4] || "Standard",
                  accident: cols[5] || "No",
                  initUrge: parseFloat(cols[6]) || 0,
                  finalUrge: parseFloat(cols[7]) || 0,
                  deferral: cols[8] || "",
                  mode: cols[9] || "Awake",
                  mA: parseFloat(cols[10]) || 0.7,
                  notes: (cols[11] || "").replace(/"/g, ""),
                  wokeMe: cols[12] || "No",
                };
              });
              const updated = [...records, ...imported];
              onRecordsChange(updated);
              await saveRecords(updated);
              showToast(`Imported ${imported.length} records`);
              document.body.removeChild(input);
            };
            input.click();
          }
        }} style={{
          width: "100%", padding: 14, borderRadius: 12, border: "none",
          background: "rgba(34,197,94,0.1)", color: "#22c55e",
          fontSize: 15, fontWeight: 600, cursor: "pointer", marginBottom: 10,
          fontFamily: "'DM Sans', sans-serif",
        }}>Import from CSV</button>

        <button onClick={async () => {
          if (window.confirm("Are you sure? This will delete ALL records permanently.")) {
            onRecordsChange([]);
            await saveRecords([]);
            onStartNew();
            showToast("All records cleared");
          }
        }} style={{
          width: "100%", padding: 14, borderRadius: 12, border: "none",
          background: "rgba(239,68,68,0.1)", color: "#ef4444",
          fontSize: 15, fontWeight: 600, cursor: "pointer",
          fontFamily: "'DM Sans', sans-serif",
        }}>Clear All Data</button>
      </div>
      <div style={{ height: 40 }} />
    </>
  );
};
