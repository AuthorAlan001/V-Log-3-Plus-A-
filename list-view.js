// ═══════════════════════════════════════════════════
// LIST-VIEW.JS — Record List with Filters
// ═══════════════════════════════════════════════════

window.ListView = function ListView({ records, filters, onFiltersChange, onJumpTo, onSetView }) {
  const maValues = [...new Set(records.map(r => String(r.mA)))].sort();
  const filtered = applyFilters(records, filters);
  const hasFilters = isFiltered(filters);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0" }}>
          Records {hasFilters && <span style={{ fontSize: 12, color: "#60a5fa" }}>({filtered.length}/{records.length})</span>}
        </div>
        <button onClick={() => exportCSV(filtered)} style={{
          padding: "6px 14px", borderRadius: 8, border: "none",
          background: "rgba(96,165,250,0.15)", color: "#60a5fa",
          fontSize: 12, fontWeight: 600, cursor: "pointer",
        }}>Export CSV</button>
      </div>

      {/* Filter controls */}
      <div style={{
        padding: "10px 12px", borderRadius: 12, background: "rgba(30,41,59,0.5)",
        marginBottom: 12, border: "1px solid rgba(100,120,160,0.1)",
      }}>
        <FilterRow label="Date Range" value={filters.dateRange}
          options={[
            { v: "All", l: "All" },
            { v: "7", l: "7 Days" },
            { v: "10", l: "10 Days" },
            { v: "30", l: "Month" },
            { v: "Custom", l: "Custom" },
          ]}
          onChange={v => onFiltersChange({...filters, dateRange: v, customFrom: v !== "Custom" ? "" : filters.customFrom, customTo: v !== "Custom" ? "" : filters.customTo })} />
        {filters.dateRange === "Custom" && (
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: "#64748b", marginBottom: 2 }}>From</div>
              <input type="date" value={filters.customFrom}
                onChange={e => onFiltersChange({...filters, customFrom: e.target.value})}
                style={{ ...inputStyle, padding: "6px 8px", fontSize: 13 }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: "#64748b", marginBottom: 2 }}>To</div>
              <input type="date" value={filters.customTo}
                onChange={e => onFiltersChange({...filters, customTo: e.target.value})}
                style={{ ...inputStyle, padding: "6px 8px", fontSize: 13 }} />
            </div>
          </div>
        )}
        <FilterRow label="Accident" value={filters.accident}
          options={["All", "Any", "Yes", "Minor", "No"]}
          onChange={v => onFiltersChange({...filters, accident: v})} />
        <FilterRow label="mA Level" value={filters.mA}
          options={["All", ...maValues]}
          onChange={v => onFiltersChange({...filters, mA: v})} />
        <FilterRow label="Woke Me" value={filters.wokeMe}
          options={["All", "Yes", "No"]}
          onChange={v => onFiltersChange({...filters, wokeMe: v})} />
        {hasFilters && (
          <button onClick={() => onFiltersChange(DEFAULT_FILTERS)} style={{
            marginTop: 4, padding: "4px 10px", borderRadius: 8, border: "none",
            background: "rgba(239,68,68,0.1)", color: "#ef4444",
            fontSize: 11, fontWeight: 600, cursor: "pointer",
          }}>Clear Filters</button>
        )}
      </div>

      {filtered.length === 0 && (
        <div style={{ color: "#64748b", textAlign: "center", marginTop: 40 }}>No matching records</div>
      )}
      {[...filtered].reverse().map((r) => {
        const idx = records.indexOf(r);
        return (
          <button key={r.id} onClick={() => { onJumpTo(idx); onSetView("form"); }} style={{
            width: "100%", padding: "12px 14px", borderRadius: 12, border: "none",
            background: "rgba(30,41,59,0.6)", marginBottom: 8, cursor: "pointer",
            textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>
                {fmt(r.date)} · {fmtTime(r.time)}
                <span style={{ fontSize: 11, color: "#a78bfa", marginLeft: 6 }}>{r.mA}mA</span>
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                {r.volume}ml · {r.type} · Urge {safeNum(r.initUrge).toFixed(1)}→{safeNum(r.finalUrge).toFixed(1)}
                {r.accident !== "No" && <span style={{ color: "#f59e0b" }}> · {r.accident}</span>}
                {r.wokeMe === "Yes" && <span style={{ color: "#8b5cf6" }}> · Woke</span>}
              </div>
              {r.notes && <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{r.notes}</div>}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#60a5fa", fontFamily: "'DM Mono', monospace" }}>
              {r.volume}<span style={{ fontSize: 11, color: "#64748b" }}>ml</span>
            </div>
          </button>
        );
      })}
      <div style={{ height: 40 }} />
    </>
  );
};
