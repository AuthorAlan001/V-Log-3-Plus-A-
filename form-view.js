// ═══════════════════════════════════════════════════
// FORM-VIEW.JS — Void Entry Form + Track Urge
// ═══════════════════════════════════════════════════

window.FormView = function FormView({
  records, settings, maHistory, currentIdx, form,
  onFormChange, onCurrentIdxChange, onSave, onDelete,
  onStartNew, showToast, onSetView,
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [trackingUrge, setTrackingUrge] = useState(null);
  const [trackData, setTrackData] = useState({ initUrge: 1, finalUrge: 0, startTime: null, elapsed: 0 });
  const trackTimer = useRef(null);

  useEffect(() => {
    return () => { if (trackTimer.current) clearInterval(trackTimer.current); };
  }, []);

  const navigate = (dir) => {
    if (records.length === 0) return;
    const newIdx = dir === "prev"
      ? Math.max(0, currentIdx - 1)
      : Math.min(records.length - 1, currentIdx + 1);
    onCurrentIdxChange(newIdx);
    setConfirmDelete(false);
  };

  const jumpTo = (idx) => {
    if (idx >= 0 && idx < records.length) {
      onCurrentIdxChange(idx);
      setConfirmDelete(false);
    }
  };

  const updateForm = (key, val) => onFormChange({ ...form, [key]: val });

  // ── Track Urge workflow ──
  const startTrackUrge = () => {
    setTrackingUrge("init");
    setTrackData({ initUrge: 1, finalUrge: 0, startTime: null, elapsed: 0 });
  };

  const confirmInitUrge = () => {
    const now = Date.now();
    setTrackData(d => ({ ...d, startTime: now }));
    setTrackingUrge("timing");
    if (trackTimer.current) clearInterval(trackTimer.current);
    trackTimer.current = setInterval(() => {
      setTrackData(d => ({ ...d, elapsed: Math.floor((Date.now() - now) / 1000) }));
    }, 1000);
  };

  const stopTrackUrge = () => {
    if (trackTimer.current) clearInterval(trackTimer.current);
    setTrackingUrge("final");
  };

  const cancelTrackUrge = () => {
    if (trackTimer.current) clearInterval(trackTimer.current);
    setTrackingUrge(null);
  };

  const finishTrackUrge = () => {
    if (trackTimer.current) clearInterval(trackTimer.current);
    const deferralMin = Math.round(trackData.elapsed / 60);
    const rec = emptyRecord();
    rec.mA = settings.mA;
    rec.mode = settings.mode;
    rec.initUrge = trackData.initUrge;
    rec.finalUrge = trackData.finalUrge;
    rec.deferral = String(deferralMin);
    onFormChange(rec);
    onCurrentIdxChange(-1);
    setTrackingUrge(null);
    onSetView("form");
    showToast("Entry ready — add volume and save");
  };

  const handleStartNew = () => {
    onStartNew();
    setConfirmDelete(false);
    setTrackingUrge(null);
  };

  return (
    <>
      {/* Navigation */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 16, gap: 8,
      }}>
        <button onClick={() => navigate("prev")} disabled={currentIdx <= 0}
          style={{ ...navBtnStyle, opacity: currentIdx <= 0 ? 0.3 : 1 }}>◀ Prev</button>
        <div style={{ textAlign: "center", flex: 1 }}>
          <span style={{ fontSize: 13, color: "#64748b" }}>
            {currentIdx === -1 ? "NEW" : `${currentIdx + 1} / ${records.length}`}
          </span>
        </div>
        <button onClick={() => navigate("next")}
          disabled={currentIdx >= records.length - 1 || currentIdx === -1}
          style={{ ...navBtnStyle, opacity: (currentIdx >= records.length - 1 || currentIdx === -1) ? 0.3 : 1 }}>
          Next ▶</button>
      </div>

      {/* New Entry + Track Urge buttons */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <button onClick={handleStartNew} style={{
          flex: 1, padding: 12, borderRadius: 12, border: "2px dashed rgba(96,165,250,0.3)",
          background: currentIdx === -1 ? "rgba(96,165,250,0.1)" : "transparent",
          color: "#60a5fa", fontSize: 14, fontWeight: 700, cursor: "pointer",
          fontFamily: "'DM Sans', sans-serif",
        }}>
          {currentIdx === -1 ? "● NEW" : "+ New"}
        </button>
        <button onClick={startTrackUrge} style={{
          flex: 1, padding: 12, borderRadius: 12, border: "2px solid rgba(249,115,22,0.4)",
          background: "rgba(249,115,22,0.08)", color: "#f97316",
          fontSize: 14, fontWeight: 700, cursor: "pointer",
          fontFamily: "'DM Sans', sans-serif",
        }}>
          ⏱ Track Urge
        </button>
      </div>

      {/* ── Track Urge Overlay ── */}
      {trackingUrge && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(2,6,23,0.95)",
          zIndex: 1000, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", padding: 30,
        }}>
          {trackingUrge === "init" && (
            <div style={{ textAlign: "center", width: "100%", maxWidth: 340 }}>
              <div style={{ fontSize: 14, color: "#f97316", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>Track Urge</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#e2e8f0", marginBottom: 24 }}>Initial Urgency</div>
              <div style={{ padding: "0 10px", marginBottom: 32 }}>
                <UrgeSlider label="" value={trackData.initUrge}
                  onChange={v => setTrackData(d => ({ ...d, initUrge: v }))}
                  color="#f97316" />
              </div>
              <button onClick={confirmInitUrge} style={{
                width: "100%", padding: 16, borderRadius: 14, border: "none",
                background: "linear-gradient(135deg, #f97316, #ea580c)",
                color: "#fff", fontSize: 17, fontWeight: 700, cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
                boxShadow: "0 4px 20px rgba(249,115,22,0.4)", marginBottom: 12,
              }}>Start Timer</button>
              <button onClick={cancelTrackUrge} style={{
                padding: "8px 20px", borderRadius: 10, border: "none",
                background: "rgba(100,120,160,0.12)", color: "#94a3b8", fontSize: 14, cursor: "pointer",
              }}>Cancel</button>
            </div>
          )}

          {trackingUrge === "timing" && (
            <div style={{ textAlign: "center", width: "100%", maxWidth: 340 }}>
              <div style={{ fontSize: 14, color: "#f97316", textTransform: "uppercase", letterSpacing: 2, marginBottom: 4 }}>Deferring</div>
              <div style={{ fontSize: 16, color: "#94a3b8", marginBottom: 20 }}>Initial urge: {safeNum(trackData.initUrge).toFixed(1)}/4</div>
              <div style={{
                fontSize: 64, fontWeight: 700, color: "#e2e8f0",
                fontFamily: "'DM Mono', monospace", marginBottom: 8,
                textShadow: "0 0 30px rgba(249,115,22,0.3)",
              }}>
                {fmtElapsed(trackData.elapsed)}
              </div>
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
                {Math.floor(trackData.elapsed / 60)} min deferred
              </div>
              {/* Tolerance indicator */}
              {settings.targetDeferral > 0 && (() => {
                const targetSec = settings.targetDeferral * 60;
                const pct = Math.min(100, (trackData.elapsed / targetSec) * 100);
                const met = trackData.elapsed >= targetSec;
                return (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 11, color: met ? "#22c55e" : "#64748b", marginBottom: 4 }}>
                      Target: {settings.targetDeferral} min {met ? "✓ MET" : ""}
                    </div>
                    <div style={{
                      width: "100%", height: 6, borderRadius: 3, background: "rgba(100,120,160,0.15)",
                      overflow: "hidden",
                    }}>
                      <div style={{
                        height: "100%", borderRadius: 3,
                        background: met ? "#22c55e" : "linear-gradient(90deg, #f97316, #ef4444)",
                        width: `${pct}%`, transition: "width 1s linear",
                      }} />
                    </div>
                  </div>
                );
              })()}
              {!settings.targetDeferral && (
                <div style={{
                  width: "100%", height: 4, borderRadius: 2, background: "rgba(100,120,160,0.15)",
                  marginBottom: 32, overflow: "hidden",
                }}>
                  <div style={{
                    height: "100%", borderRadius: 2,
                    background: "linear-gradient(90deg, #f97316, #ef4444)",
                    width: `${Math.min(100, (trackData.elapsed / 600) * 100)}%`,
                    transition: "width 1s linear",
                  }} />
                </div>
              )}
              <button onClick={stopTrackUrge} style={{
                width: "100%", padding: 18, borderRadius: 14, border: "none",
                background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                color: "#fff", fontSize: 18, fontWeight: 700, cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
                boxShadow: "0 4px 20px rgba(59,130,246,0.4)", marginBottom: 12,
              }}>Next →</button>
              <button onClick={cancelTrackUrge} style={{
                padding: "8px 20px", borderRadius: 10, border: "none",
                background: "rgba(100,120,160,0.12)", color: "#94a3b8", fontSize: 14, cursor: "pointer",
              }}>Cancel</button>
            </div>
          )}

          {trackingUrge === "final" && (
            <div style={{ textAlign: "center", width: "100%", maxWidth: 340 }}>
              <div style={{ fontSize: 14, color: "#f97316", textTransform: "uppercase", letterSpacing: 2, marginBottom: 4 }}>Track Urge</div>
              <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 4 }}>
                Initial: {safeNum(trackData.initUrge).toFixed(1)}/4 · Deferred: {Math.round(trackData.elapsed / 60)} min
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#e2e8f0", marginBottom: 24, marginTop: 12 }}>Final Urgency</div>
              <div style={{ padding: "0 10px", marginBottom: 32 }}>
                <UrgeSlider label="" value={trackData.finalUrge}
                  onChange={v => setTrackData(d => ({ ...d, finalUrge: v }))}
                  color="#a78bfa" />
              </div>
              <button onClick={finishTrackUrge} style={{
                width: "100%", padding: 16, borderRadius: 14, border: "none",
                background: "linear-gradient(135deg, #22c55e, #16a34a)",
                color: "#fff", fontSize: 17, fontWeight: 700, cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
                boxShadow: "0 4px 20px rgba(34,197,94,0.4)", marginBottom: 12,
              }}>Done — Edit & Save</button>
              <button onClick={cancelTrackUrge} style={{
                padding: "8px 20px", borderRadius: 10, border: "none",
                background: "rgba(100,120,160,0.12)", color: "#94a3b8", fontSize: 14, cursor: "pointer",
              }}>Cancel</button>
            </div>
          )}
        </div>
      )}

      {/* Date & Time */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <Field label="Date">
            <input type="date" value={form.date} onChange={e => updateForm("date", e.target.value)} style={inputStyle} />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Time">
            <input type="time" value={form.time} onChange={e => updateForm("time", e.target.value)} style={inputStyle} />
          </Field>
        </div>
      </div>

      {/* Volume */}
      <Field label="Volume (ml)">
        <input type="number" inputMode="numeric" value={form.volume}
          onChange={e => updateForm("volume", e.target.value)}
          placeholder="e.g. 250" style={{ ...inputStyle, fontSize: 22, fontWeight: 700, fontFamily: "'DM Mono', monospace" }} />
      </Field>

      {/* Type */}
      <Field label="Void Type">
        <PillSelect options={CONFIG.types} value={form.type} onChange={v => updateForm("type", v)} />
      </Field>

      {/* Accident */}
      <Field label="Accident?">
        <PillSelect options={CONFIG.accidents} value={form.accident} onChange={v => updateForm("accident", v)}
          color={form.accident === "Yes" ? "#ef4444" : form.accident === "Minor" ? "#f59e0b" : "#60a5fa"} />
      </Field>

      {/* Woke Me */}
      <Field label="Woke Me?">
        <PillSelect options={["No", "Yes"]} value={form.wokeMe} onChange={v => updateForm("wokeMe", v)} />
      </Field>

      {/* Urge Sliders (NEW — replaces integer steppers) */}
      <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
        <UrgeSlider label="Init Urge" value={safeNum(form.initUrge)}
          onChange={v => updateForm("initUrge", v)} color="#60a5fa" />
        <UrgeSlider label="Final Urge" value={safeNum(form.finalUrge)}
          onChange={v => updateForm("finalUrge", v)} color="#a78bfa" />
      </div>

      {/* Deferral */}
      <Field label="Deferral (min)">
        <input type="number" inputMode="numeric" value={form.deferral}
          onChange={e => updateForm("deferral", e.target.value)}
          placeholder="minutes deferred" style={inputStyle} />
      </Field>

      {/* Mode */}
      <Field label="Mode">
        <PillSelect options={CONFIG.modes} value={form.mode} onChange={v => updateForm("mode", v)}
          color={form.mode === "Asleep" ? "#8b5cf6" : "#60a5fa"} />
      </Field>

      {/* mA */}
      <Field label={`Current mA: ${form.mA}`}>
        <input type="range" min="0" max="3" step="0.1" value={form.mA}
          onChange={e => updateForm("mA", parseFloat(e.target.value))}
          style={{ width: "100%", accentColor: "#60a5fa" }} />
      </Field>

      {/* Notes */}
      <Field label="Notes">
        <textarea value={form.notes || ""} onChange={e => updateForm("notes", e.target.value)}
          rows={2} placeholder="Optional notes..."
          style={{ ...inputStyle, resize: "vertical", minHeight: 60 }} />
      </Field>

      {/* Save / Update */}
      <button onClick={onSave} style={{
        width: "100%", padding: 16, borderRadius: 14, border: "none",
        background: currentIdx === -1
          ? "linear-gradient(135deg, #3b82f6, #2563eb)"
          : "linear-gradient(135deg, #22c55e, #16a34a)",
        color: "#fff", fontSize: 17, fontWeight: 700, cursor: "pointer",
        fontFamily: "'DM Sans', sans-serif",
        boxShadow: currentIdx === -1
          ? "0 4px 20px rgba(59,130,246,0.4)"
          : "0 4px 20px rgba(34,197,94,0.4)",
        marginBottom: 10,
      }}>
        {currentIdx === -1 ? "SAVE NEW RECORD" : "UPDATE RECORD"}
      </button>

      {/* Delete */}
      {currentIdx >= 0 && (
        <button onClick={() => {
          if (!confirmDelete) { setConfirmDelete(true); return; }
          onDelete();
          setConfirmDelete(false);
        }} style={{
          width: "100%", padding: 12, borderRadius: 12, border: "none",
          background: confirmDelete ? "#ef4444" : "rgba(239,68,68,0.1)",
          color: confirmDelete ? "#fff" : "#ef4444",
          fontSize: 14, fontWeight: 600, cursor: "pointer",
          fontFamily: "'DM Sans', sans-serif",
        }}>
          {confirmDelete ? "TAP AGAIN TO CONFIRM DELETE" : "Delete Record"}
        </button>
      )}
      <div style={{ height: 40 }} />
    </>
  );
};
