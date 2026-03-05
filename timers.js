// ═══════════════════════════════════════════════════
// TIMERS.JS — Persistent Timer Engine & UI Strip
// Up to 3 concurrent timers, survives app close/screen off
// V Log Plus v3.1.0
// ═══════════════════════════════════════════════════

// Common timer presets for quick-start
const TIMER_PRESETS = [
  { label: "Since last void", direction: "up" },
  { label: "Since last snack", direction: "up" },
  { label: "Custom", direction: "up" },
];

// ── Chime: Web Audio API tone (no audio file needed, works offline) ──
function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [659.25, 783.99, 987.77]; // E5, G5, B5 — pleasant major triad
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 0.5);
    });
    // Clean up context after sounds finish
    setTimeout(() => ctx.close().catch(() => {}), 2000);
  } catch(e) { /* Audio not available — silent fallback */ }
}

// ── TimerStrip: Collapsible bar showing active timers ──
window.TimerStrip = function TimerStrip({ timers, onTimersChange, showToast }) {
  const [tick, setTick] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newDirection, setNewDirection] = useState("up");
  const [newDuration, setNewDuration] = useState("");
  const tickRef = useRef(null);
  const chimedRef = useRef(new Set()); // Track which timers have already chimed

  // Tick every second to update displays and check for expirations
  useEffect(() => {
    if (timers.length > 0) {
      tickRef.current = setInterval(() => {
        setTick(t => t + 1);
        // Check for newly expired countdown timers
        timers.forEach(timer => {
          if (timer.direction === "down" && timer.durationSeconds && !chimedRef.current.has(timer.id)) {
            const started = new Date(timer.startedAt).getTime();
            const elapsedSec = Math.floor((Date.now() - started) / 1000);
            const remaining = timer.durationSeconds - elapsedSec;
            if (remaining <= 0) {
              chimedRef.current.add(timer.id);
              playChime();
            }
          }
        });
      }, 1000);
    }
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [timers]);

  // Clean up chimed set when timers are removed
  useEffect(() => {
    const activeIds = new Set(timers.map(t => t.id));
    chimedRef.current.forEach(id => {
      if (!activeIds.has(id)) chimedRef.current.delete(id);
    });
  }, [timers]);

  const addTimer = async () => {
    if (timers.length >= 3) { showToast("Max 3 timers"); return; }
    const label = newLabel.trim() || "Timer " + (timers.length + 1);
    const timer = {
      id: Date.now().toString(),
      label: label,
      startedAt: new Date().toISOString(),
      direction: newDirection,
      durationSeconds: newDirection === "down" ? (parseInt(newDuration) || 5) * 60 : null,
      status: "running",
    };
    const updated = [...timers, timer];
    onTimersChange(updated);
    await saveTimers(updated);
    setShowAdd(false);
    setNewLabel("");
    setNewDuration("");
    showToast("Timer started");
  };

  const removeTimer = async (id) => {
    const updated = timers.filter(t => t.id !== id);
    onTimersChange(updated);
    await saveTimers(updated);
  };

  const getElapsed = (timer) => {
    const started = new Date(timer.startedAt).getTime();
    const now = Date.now();
    const elapsedSec = Math.floor((now - started) / 1000);

    if (timer.direction === "down" && timer.durationSeconds) {
      const remaining = Math.max(0, timer.durationSeconds - elapsedSec);
      return { seconds: remaining, expired: remaining === 0, total: elapsedSec };
    }
    return { seconds: elapsedSec, expired: false, total: elapsedSec };
  };

  const fmtTimer = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
    return m + ":" + String(s).padStart(2, "0");
  };

  if (timers.length === 0 && !showAdd) {
    return (
      <div style={{
        padding: "6px 20px", borderBottom: "1px solid rgba(100,120,160,0.1)",
        display: "flex", justifyContent: "center",
      }}>
        <button onClick={() => setShowAdd(true)} style={{
          padding: "4px 14px", borderRadius: 8, border: "1px dashed rgba(100,120,160,0.3)",
          background: "transparent", color: "#64748b", fontSize: 12, cursor: "pointer",
          fontFamily: "'DM Sans', sans-serif",
        }}>+ Timer</button>
      </div>
    );
  }

  return (
    <div style={{
      padding: "8px 16px",
      borderBottom: "1px solid rgba(100,120,160,0.15)",
      background: "rgba(15,23,42,0.3)",
    }}>
      {/* Active timers */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {timers.map(timer => {
          const elapsed = getElapsed(timer);
          const isExpired = elapsed.expired;
          const color = timer.direction === "down"
            ? (isExpired ? "#ef4444" : elapsed.seconds < 60 ? "#f59e0b" : "#22c55e")
            : "#60a5fa";

          return (
            <div key={timer.id} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "4px 10px", borderRadius: 10,
              background: isExpired ? "rgba(239,68,68,0.15)" : "rgba(96,165,250,0.08)",
              border: `1px solid ${isExpired ? "rgba(239,68,68,0.3)" : "rgba(96,165,250,0.15)"}`,
              animation: isExpired ? "pulse 1s infinite" : "none",
            }}>
              <span style={{ fontSize: 11, color: "#94a3b8", maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {timer.label}
              </span>
              <span style={{
                fontSize: 15, fontWeight: 700, color: color,
                fontFamily: "'DM Mono', monospace", minWidth: 50,
              }}>
                {timer.direction === "down" && isExpired ? "DONE" : fmtTimer(elapsed.seconds)}
              </span>
              <button onClick={() => removeTimer(timer.id)} style={{
                width: 20, height: 20, borderRadius: 10, border: "none",
                background: "rgba(239,68,68,0.15)", color: "#ef4444",
                fontSize: 11, cursor: "pointer", display: "flex",
                alignItems: "center", justifyContent: "center", padding: 0,
              }}>✕</button>
            </div>
          );
        })}

        {timers.length < 3 && !showAdd && (
          <button onClick={() => setShowAdd(true)} style={{
            width: 28, height: 28, borderRadius: 8, border: "1px dashed rgba(100,120,160,0.3)",
            background: "transparent", color: "#64748b", fontSize: 16, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
          }}>+</button>
        )}
      </div>

      {/* Add timer form */}
      {showAdd && (
        <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 10, background: "rgba(30,41,59,0.5)" }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {TIMER_PRESETS.map(p => (
              <button key={p.label} onClick={() => {
                if (p.label !== "Custom") { setNewLabel(p.label); setNewDirection(p.direction); }
              }} style={{
                padding: "4px 10px", borderRadius: 8, border: "none",
                background: newLabel === p.label ? "#60a5fa" : "rgba(100,120,160,0.12)",
                color: newLabel === p.label ? "#fff" : "#94a3b8",
                fontSize: 11, cursor: "pointer",
              }}>{p.label}</button>
            ))}
          </div>
          <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
            placeholder="Timer label..."
            style={{ ...inputStyle, padding: "6px 10px", fontSize: 13, marginBottom: 6 }} />
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <button onClick={() => setNewDirection("up")} style={{
              flex: 1, padding: "6px 0", borderRadius: 8, border: "none",
              background: newDirection === "up" ? "#60a5fa" : "rgba(100,120,160,0.12)",
              color: newDirection === "up" ? "#fff" : "#94a3b8",
              fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>Count Up ↑</button>
            <button onClick={() => setNewDirection("down")} style={{
              flex: 1, padding: "6px 0", borderRadius: 8, border: "none",
              background: newDirection === "down" ? "#f59e0b" : "rgba(100,120,160,0.12)",
              color: newDirection === "down" ? "#fff" : "#94a3b8",
              fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>Countdown ↓</button>
          </div>
          {newDirection === "down" && (
            <input type="number" inputMode="numeric" value={newDuration}
              onChange={e => setNewDuration(e.target.value)}
              placeholder="Minutes..."
              style={{ ...inputStyle, padding: "6px 10px", fontSize: 13, marginBottom: 6 }} />
          )}
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={addTimer} style={{
              flex: 1, padding: 8, borderRadius: 8, border: "none",
              background: "#22c55e", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>Start</button>
            <button onClick={() => setShowAdd(false)} style={{
              padding: "8px 14px", borderRadius: 8, border: "none",
              background: "rgba(100,120,160,0.12)", color: "#94a3b8",
              fontSize: 13, cursor: "pointer",
            }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};
