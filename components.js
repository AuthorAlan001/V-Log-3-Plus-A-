// ═══════════════════════════════════════════════════
// COMPONENTS.JS — Shared UI Components
// Field, PillSelect, UrgeSlider, FilterRow
// ═══════════════════════════════════════════════════

// ── Field wrapper ──
window.Field = function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 11, color: "#8a9ab5", marginBottom: 5,
        textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 600,
      }}>{label}</div>
      {children}
    </div>
  );
};

// ── Pill selector ──
window.PillSelect = function PillSelect({ options, value, onChange, color = "#60a5fa" }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {options.map(opt => (
        <button key={opt} onClick={() => onChange(opt)} style={{
          padding: "8px 14px", borderRadius: 20, border: "none",
          background: value === opt ? color : "rgba(100,120,160,0.12)",
          color: value === opt ? "#fff" : "#b0bec5",
          fontSize: 14, fontWeight: value === opt ? 700 : 500,
          cursor: "pointer", transition: "all 0.15s",
          fontFamily: "'DM Sans', sans-serif",
        }}>{opt}</button>
      ))}
    </div>
  );
};

// ── Urge Slider (replaces old UrgeControl stepper) ──
// Smooth 0.0–4.0 range with 0.1 steps, large value display, anchor taps
window.UrgeSlider = function UrgeSlider({ label, value, onChange, color = "#60a5fa" }) {
  const displayVal = safeNum(value, 0).toFixed(1);
  const valColor = value >= 3 ? "#f87171" : value >= 2 ? "#fbbf24" : color;

  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 11, color: "#8a9ab5", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      {/* Large value display */}
      <div style={{
        textAlign: "center", fontSize: 32, fontWeight: 700,
        color: valColor, fontFamily: "'DM Mono', monospace",
        marginBottom: 6, lineHeight: 1,
      }}>{displayVal}</div>
      {/* Slider */}
      <input type="range" min="0" max="4" step="0.1"
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{
          width: "100%", accentColor: valColor,
          height: 28, cursor: "pointer",
        }}
      />
      {/* Anchor taps for whole numbers */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
        {[0, 1, 2, 3, 4].map(n => (
          <button key={n} onClick={() => onChange(n)} style={{
            width: 32, height: 26, borderRadius: 8, border: "none",
            background: Math.abs(value - n) < 0.05 ? "rgba(96,165,250,0.2)" : "transparent",
            color: Math.abs(value - n) < 0.05 ? color : "#64748b",
            fontSize: 12, fontWeight: 600, cursor: "pointer",
            fontFamily: "'DM Mono', monospace",
          }}>{n}</button>
        ))}
      </div>
    </div>
  );
};

// ── Filter Row (used in list view) ──
window.FilterRow = function FilterRow({ label, value, options, onChange }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {options.map(opt => {
          const optVal = opt.v || opt;
          const optLabel = opt.l || opt;
          return (
            <button key={optVal} onClick={() => onChange(optVal)} style={{
              padding: "5px 10px", borderRadius: 14, border: "none",
              background: value === optVal ? "#60a5fa" : "rgba(100,120,160,0.12)",
              color: value === optVal ? "#fff" : "#94a3b8",
              fontSize: 12, fontWeight: value === optVal ? 700 : 500, cursor: "pointer",
            }}>{optLabel}</button>
          );
        })}
      </div>
    </div>
  );
};
