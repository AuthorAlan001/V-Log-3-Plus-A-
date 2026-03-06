// ═══════════════════════════════════════════════════
// APP.JS — Main Application Component
// State management, navigation, view routing
// ═══════════════════════════════════════════════════

function NeuroStimLog() {
  const [records, setRecords] = useState([]);
  const [settings, setSettings] = useState(defaultSettings);
  const [maHistory, setMaHistory] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(-1);
  const [form, setForm] = useState(emptyRecord());
  const [view, setView] = useState("form");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [intakes, setIntakes] = useState([]);
  const [doctorNotes, setDoctorNotes] = useState([]);
  const [timers, setTimers] = useState([]);
  const [downloadInfo, setDownloadInfo] = useState(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [adminMode, setAdminMode] = useState(false);
  const [providerConfig, setProviderConfig] = useState(null);
  const [navAdminPrompt, setNavAdminPrompt] = useState(false);
  const [navPwVal, setNavPwVal] = useState("");
  const navTapCountRef = useRef(0);
  const navTapTimerRef = useRef(null);
  const navPwInputRef = useRef(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4000);
  }, []);

  // ── Nav icon 5-tap admin trigger ──
  const handleNavSettingsTap = () => {
    if (view === "settings") {
      navTapCountRef.current++;
      if (navTapTimerRef.current) clearTimeout(navTapTimerRef.current);
      if (navTapCountRef.current >= 5) {
        navTapCountRef.current = 0;
        if (adminMode) {
          setAdminMode(false);
          showToast("Session reset");
        } else {
          setNavAdminPrompt(true);
          setNavPwVal("");
          setTimeout(() => { if (navPwInputRef.current) navPwInputRef.current.focus(); }, 100);
        }
        return;
      }
      navTapTimerRef.current = setTimeout(() => { navTapCountRef.current = 0; }, 2000);
    }
    setView("settings");
  };

  const handleNavPwSubmit = async () => {
    const ok = await checkAdminPassword(navPwVal);
    if (ok) {
      setAdminMode(true);
      setNavAdminPrompt(false);
      setNavPwVal("");
      showToast("Extended mode activated");
    } else {
      showToast("Invalid");
      setNavPwVal("");
    }
  };

  // Listen for SW update
  useEffect(() => {
    // Check if already waiting when component mounts
    if (window._swUpdateReady) setUpdateReady(true);

    const handler = () => setUpdateReady(true);
    window.addEventListener('sw-update-ready', handler);
    return () => window.removeEventListener('sw-update-ready', handler);
  }, []);

  // Apply update: tell waiting SW to take over, then page reloads via controllerchange
  const applyUpdate = () => {
    const reg = window._swRegistration;
    if (reg && reg.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    // Fallback: if controllerchange doesn't fire within 2s, force reload
    setTimeout(() => window.location.reload(), 2000);
  };

  // Load all data on mount (with migration from old DB)
  useEffect(() => {
    (async () => {
      // Run migration before loading data
      if (window.migrateFromOldDB) {
        try { await window.migrateFromOldDB(); } catch(e) { console.error('Migration error:', e); }
      }

      const [recs, s, mah, ints, notes, tmrs] = await Promise.all([
        loadRecords(), loadSettings(), loadMaHistory(), loadIntakes(), loadDoctorNotes(), loadTimers(),
      ]);
      setRecords(recs);
      setSettings(s);
      setMaHistory(mah);
      setIntakes(ints);
      setDoctorNotes(notes);
      setTimers(tmrs);

      // Load provider configuration (if any)
      try {
        var pc = await loadProviderConfig();
        if (pc) setProviderConfig(pc);
      } catch(e) {}

      if (recs.length > 0) {
        setCurrentIdx(recs.length - 1);
        setForm(recs[recs.length - 1]);
      }
      setLoading(false);
    })();
  }, []);

  // ── Record navigation ──
  const handleCurrentIdxChange = (idx) => {
    if (idx >= 0 && idx < records.length) {
      setCurrentIdx(idx);
      setForm({ ...records[idx] });
    } else {
      setCurrentIdx(idx);
    }
  };

  const startNew = () => {
    const rec = emptyRecord();
    rec.mA = settings.mA;
    rec.mode = settings.mode;
    setForm(rec);
    setCurrentIdx(-1);
  };

  // ── Save handler ──
  const handleSave = async () => {
    const errors = [];
    if (!form.date) errors.push("Date is required");
    if (!form.time) errors.push("Time is required");
    const vol = parseFloat(form.volume);
    if (!form.volume && form.volume !== 0 && form.volume !== "0") {
      errors.push("Volume is required");
    } else if (form.volume && (isNaN(vol) || vol < 0)) {
      errors.push("Volume must be a positive number");
    } else if (vol > 2000) {
      errors.push("Volume seems too high — please check");
    }
    const ma = parseFloat(form.mA);
    if (isNaN(ma) || ma < 0 || ma > 10) errors.push("mA must be between 0 and 10");
    if (form.initUrge < 0 || form.initUrge > CONFIG.maxUrge) errors.push("Init Urge out of range");
    if (form.finalUrge < 0 || form.finalUrge > CONFIG.maxUrge) errors.push("Final Urge out of range");
    if (!CONFIG.types.includes(form.type)) errors.push("Invalid void type");
    if (!CONFIG.accidents.includes(form.accident)) errors.push("Invalid accident value");
    if (errors.length > 0) { showToast(errors[0]); return; }

    const cleanForm = {
      ...form,
      volume: String(vol),
      mA: ma,
      initUrge: safeNum(form.initUrge),
      finalUrge: safeNum(form.finalUrge),
      deferral: form.deferral ? String(Math.max(0, parseInt(form.deferral) || 0)) : "",
    };

    try {
      const lastMa = maHistory.length > 0 ? maHistory[maHistory.length - 1].mA : settings.mA;
      let updatedMaHistory = maHistory;
      if (ma !== lastMa) {
        const entry = { date: cleanForm.date, mA: ma, mode: cleanForm.mode, notes: `Changed from ${lastMa} to ${ma}` };
        updatedMaHistory = [...maHistory, entry];
        setMaHistory(updatedMaHistory);
        await saveMaHistory(updatedMaHistory);
      }

      let updated;
      if (currentIdx === -1) {
        const rec = { ...cleanForm, id: Date.now().toString() };
        updated = [...records, rec];
        setRecords(updated);
        setCurrentIdx(updated.length - 1);
        setForm(rec);
        showToast("Record saved");
      } else {
        updated = records.map((r, i) => i === currentIdx ? { ...cleanForm } : r);
        setRecords(updated);
        showToast("Record updated");
      }
      await saveRecords(updated);
    } catch (e) {
      console.error("Save error:", e);
      showToast("Save failed — please try again");
    }
  };

  // ── Delete handler ──
  const handleDelete = async () => {
    if (currentIdx >= 0 && currentIdx < records.length) {
      try {
        const updated = records.filter((_, i) => i !== currentIdx);
        setRecords(updated);
        await saveRecords(updated);
        if (updated.length === 0) { startNew(); }
        else {
          const newIdx = Math.min(currentIdx, updated.length - 1);
          setCurrentIdx(newIdx);
          setForm({ ...updated[newIdx] });
        }
        showToast("Record deleted");
      } catch (e) {
        console.error("Delete error:", e);
        showToast("Delete failed — please try again");
      }
    }
  };

  const totalVoids = records.length;

  if (loading) return (
    <div style={{ ...containerStyle, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "#60a5fa", fontSize: 18 }}>Loading...</div>
    </div>
  );

  return (
    <div style={{
      ...containerStyle,
      background: adminMode
        ? "linear-gradient(180deg, #3d1a2e 0%, #2e1a2a 100%)"
        : containerStyle.background,
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* ── UPDATE AVAILABLE BANNER ── */}
      {updateReady && (
        <div onClick={applyUpdate} style={{
          position: "sticky", top: 0, zIndex: 100,
          background: "linear-gradient(90deg, #059669, #10b981)",
          padding: "10px 20px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          cursor: "pointer",
          boxShadow: "0 2px 12px rgba(16,185,129,0.4)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>🔄</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Update Available</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.8)" }}>Tap to refresh and get the latest version</div>
            </div>
          </div>
          <div style={{
            padding: "5px 12px", borderRadius: 8,
            background: "rgba(255,255,255,0.2)", color: "#fff",
            fontSize: 12, fontWeight: 600,
          }}>Update</div>
        </div>
      )}

      {/* ── TWO-ROW STICKY NAV BAR ── */}
      <div style={{
        position: "sticky", top: updateReady ? 52 : 0, zIndex: 50,
        background: "linear-gradient(180deg, #0f172a 0%, #131c30 100%)",
        borderBottom: "1px solid rgba(100,120,160,0.15)",
        padding: "10px 16px 8px",
      }}>
        {/* App title row */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 8,
        }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#e2e8f0", fontFamily: "'DM Sans', sans-serif" }}>
            Neuro-Stim Log
          </div>
          <div style={{ fontSize: 11, color: "#64748b" }}>
            v{APP_VERSION} · {totalVoids} rec · {settings.mA} mA
          </div>
        </div>

        {/* Icon grid: 2 rows × 3 columns */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 6,
        }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => tab.id === "settings" ? handleNavSettingsTap() : setView(tab.id)} style={{
              padding: "10px 0",
              borderRadius: 12,
              border: "none",
              cursor: "pointer",
              background: view === tab.id ? "rgba(96,165,250,0.2)" : "transparent",
              transition: "all 0.15s",
              position: "relative",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{
                fontSize: 28,
                filter: view === tab.id ? "none" : "grayscale(50%) opacity(0.5)",
                transition: "all 0.15s",
              }}>{tab.icon}</span>
              {/* Active indicator */}
              {view === tab.id && (
                <div style={{
                  position: "absolute", bottom: 2, left: "25%", right: "25%",
                  height: 3, borderRadius: 2, background: "#60a5fa",
                }} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Nav Admin Password Prompt ── */}
      {navAdminPrompt && (
        <div style={{
          padding: "10px 16px",
          background: "rgba(30,41,59,0.8)",
          borderBottom: "1px solid rgba(100,120,160,0.2)",
          display: "flex", gap: 6, alignItems: "center",
        }}>
          <input ref={navPwInputRef} type="password" value={navPwVal}
            onChange={e => setNavPwVal(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleNavPwSubmit(); }}
            placeholder="Enter code..."
            style={{ ...inputStyle, flex: 1, padding: "8px 12px", fontSize: 14 }} />
          <button onClick={handleNavPwSubmit} style={{
            padding: "8px 14px", borderRadius: 8, border: "none",
            background: "#3b82f6", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>OK</button>
          <button onClick={() => { setNavAdminPrompt(false); setNavPwVal(""); }} style={{
            padding: "8px 10px", borderRadius: 8, border: "none",
            background: "rgba(100,120,160,0.12)", color: "#94a3b8", fontSize: 13, cursor: "pointer",
          }}>✕</button>
        </div>
      )}

      {/* ── Timer Strip ── */}
      <TimerStrip timers={timers} onTimersChange={setTimers} showToast={showToast} settings={settings} />

      {/* ── Provider Info Banner (when configured) ── */}
      {providerConfig && providerConfig.preparedFor && (
        <div style={{
          padding: "6px 16px",
          background: "rgba(59,130,246,0.08)",
          borderBottom: "1px solid rgba(59,130,246,0.15)",
          fontSize: 11, color: "#94a3b8",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span>Prepared for <strong style={{ color: "#e2e8f0" }}>{providerConfig.preparedFor}</strong></span>
          {providerConfig.contact && (
            <a href={providerConfig.contact.includes("@") ? "mailto:" + providerConfig.contact : "tel:" + providerConfig.contact}
              style={{ color: "#60a5fa", fontSize: 11, textDecoration: "none" }}>
              Contact
            </a>
          )}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)",
          background: "#22c55e", color: "#fff", padding: "8px 20px", borderRadius: 20,
          fontSize: 14, fontWeight: 600, zIndex: 999, fontFamily: "'DM Sans', sans-serif",
          boxShadow: "0 4px 20px rgba(34,197,94,0.4)", cursor: "pointer",
        }} onClick={() => { if (toastTimer.current) clearTimeout(toastTimer.current); setToast(""); }}>{toast}</div>
      )}

      {/* Inline Report Viewer */}
      {downloadInfo && (
        <div style={{
          position: "fixed", inset: 0, background: "#fff",
          zIndex: 1000, display: "flex", flexDirection: "column",
        }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "10px 16px", background: "#1e293b",
            borderBottom: "1px solid rgba(100,120,160,0.2)",
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>Doctor Report</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => {
                try {
                  const blob = new Blob([downloadInfo.html], { type: "text/html" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "neuro-stim-report-" + new Date().toISOString().slice(0,10) + ".html";
                  a.click();
                  URL.revokeObjectURL(url);
                  showToast("Report saved to Downloads");
                } catch(e) { showToast("Save failed"); }
              }} style={{
                padding: "6px 12px", borderRadius: 8, border: "none",
                background: "rgba(16,185,129,0.2)", color: "#10b981",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}>Save File</button>
              <button onClick={() => setDownloadInfo(null)} style={{
                padding: "6px 12px", borderRadius: 8, border: "none",
                background: "rgba(239,68,68,0.2)", color: "#ef4444",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}>✕ Close</button>
            </div>
          </div>
          <iframe
            srcDoc={downloadInfo.html}
            style={{ flex: 1, border: "none", width: "100%" }}
            title="Neuro-Stim Report"
          />
        </div>
      )}

      {/* ── Content Area ── */}
      <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1 }}>

        {view === "form" && (
          <FormView
            records={records} settings={settings} maHistory={maHistory}
            currentIdx={currentIdx} form={form}
            onFormChange={setForm} onCurrentIdxChange={handleCurrentIdxChange}
            onSave={handleSave} onDelete={handleDelete} onStartNew={startNew}
            showToast={showToast} onSetView={setView}
          />
        )}

        {view === "list" && (
          <ListView
            records={records} filters={filters} onFiltersChange={setFilters}
            onJumpTo={handleCurrentIdxChange} onSetView={setView}
          />
        )}

        {view === "stats" && (
          <StatsView
            records={records} settings={settings} maHistory={maHistory} intakes={intakes}
          />
        )}

        {view === "intake" && (
          <IntakeView
            intakes={intakes} onIntakesChange={setIntakes} showToast={showToast}
          />
        )}

        {view === "report" && (
          <ReportView
            records={records} settings={settings} maHistory={maHistory}
            intakes={intakes} filters={filters} onFiltersChange={setFilters}
            doctorNotes={doctorNotes} onDoctorNotesChange={setDoctorNotes}
            showToast={showToast} onShowReport={(html) => setDownloadInfo({ html })}
            providerConfig={providerConfig}
          />
        )}

        {view === "settings" && (
          <SettingsView
            settings={settings} onUpdateSettings={setSettings}
            maHistory={maHistory} onMaHistoryChange={setMaHistory}
            records={records} onRecordsChange={setRecords}
            intakes={intakes} onIntakesChange={setIntakes}
            doctorNotes={doctorNotes} onDoctorNotesChange={setDoctorNotes}
            timers={timers} onTimersChange={setTimers}
            showToast={showToast} onStartNew={startNew}
            adminMode={adminMode} onAdminModeChange={setAdminMode}
            providerConfig={providerConfig} onProviderConfigChange={setProviderConfig}
          />
        )}
      </div>
    </div>
  );
}

const containerStyle = {
  maxWidth: 480, margin: "0 auto", minHeight: "100vh",
  background: "linear-gradient(180deg, #0f172a 0%, #1e293b 100%)",
  fontFamily: "'DM Sans', sans-serif", display: "flex", flexDirection: "column",
  color: "#e2e8f0",
};

ReactDOM.createRoot(document.getElementById('root')).render(
  React.createElement(NeuroStimLog)
);
