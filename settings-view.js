// ═══════════════════════════════════════════════════
// SETTINGS-VIEW.JS — App Settings & Data Management
// Smart CSV import with header detection & validation
// v3.3 — Admin mode, provider config, comprehensive error handling
// ═══════════════════════════════════════════════════

// Chime repeat interval presets (seconds)
const CHIME_INTERVAL_OPTIONS = [
  { label: "15s", value: 15 },
  { label: "30s", value: 30 },
  { label: "45s", value: 45 },
  { label: "60s", value: 60 },
];

// ══════════════════════════════════════════════════
// CSV PARSING & IMPORT HELPERS
// ══════════════════════════════════════════════════

// Smart CSV line parser that respects quoted fields
// (handles commas inside notes like "Ribs, potatoes, salad")
function parseCSVLine(line) {
  const cols = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cols.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cols.push(current.trim());
  return cols;
}

function normalizeHeader(h) {
  return (h || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isValidDate(s) {
  if (!s || typeof s !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.trim())) return false;
  var d = new Date(s.trim() + "T00:00:00");
  return !isNaN(d.getTime());
}

function isValidTime(s) {
  if (!s || typeof s !== 'string') return false;
  return /^\d{1,2}:\d{2}$/.test(s.trim());
}

// Void record: map normalized header → record field name
const VOID_HEADER_MAP = {
  'id': 'id',
  'date': 'date',
  'time': 'time',
  'vol': 'volume', 'volume': 'volume', 'volumeml': 'volume', 'volml': 'volume',
  'type': 'type', 'voidtype': 'type',
  'acc': 'accident', 'accident': 'accident',
  'initurge': 'initUrge', 'initialurge': 'initUrge', 'inurge': 'initUrge',
  'finalurge': 'finalUrge', 'finurge': 'finalUrge',
  'def': 'deferral', 'deferral': 'deferral', 'deferralmin': 'deferral',
  'mode': 'mode',
  'ma': 'mA',
  'notes': 'notes',
  'wokeme': 'wokeMe', 'woke': 'wokeMe',
};

// Intake record: map normalized header → intake field name
const INTAKE_HEADER_MAP = {
  'date': 'date',
  'time': 'time',
  'category': 'category', 'cat': 'category',
  'type': 'subtype', 'subtype': 'subtype', 'item': 'subtype',
  'amount': 'amount', 'amountml': 'amount', 'ml': 'amount',
  'size': 'mealSize', 'mealsize': 'mealSize',
  'notes': 'notes',
};

function detectCSVType(headers) {
  var normalized = headers.map(normalizeHeader);
  var hasCategory = normalized.some(function(h) { return h === 'category' || h === 'cat'; });
  var hasVoidFields = normalized.some(function(h) {
    return h === 'acc' || h === 'accident' || h === 'initurge' || h === 'initialurge' ||
      h === 'deferral' || h === 'def' || h === 'wokeme' || h === 'woke' || h === 'ma';
  });
  if (hasCategory && !hasVoidFields) return 'intake';
  if (hasVoidFields) return 'void';
  var voidMatches = normalized.filter(function(h) { return VOID_HEADER_MAP[h]; }).length;
  var intakeMatches = normalized.filter(function(h) { return INTAKE_HEADER_MAP[h]; }).length;
  if (voidMatches >= intakeMatches && voidMatches >= 3) return 'void';
  if (intakeMatches > voidMatches && intakeMatches >= 3) return 'intake';
  return 'unknown';
}

function buildColumnMap(headers, headerMap) {
  var map = {};
  headers.forEach(function(h, i) {
    var norm = normalizeHeader(h);
    if (headerMap[norm] && map[headerMap[norm]] === undefined) {
      map[headerMap[norm]] = i;
    }
  });
  return map;
}

function colVal(cols, colMap, field, fallback) {
  if (colMap[field] === undefined) return fallback !== undefined ? fallback : "";
  var val = cols[colMap[field]];
  if (val === undefined || val === null) return fallback !== undefined ? fallback : "";
  val = val.replace(/^"|"$/g, '').trim();
  return val || (fallback !== undefined ? fallback : "");
}


// ══════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════

window.SettingsView = function SettingsView({
  settings, onUpdateSettings, maHistory, onMaHistoryChange, records, onRecordsChange,
  intakes, onIntakesChange, doctorNotes, onDoctorNotesChange, timers, onTimersChange,
  showToast, onStartNew,
  adminMode, onAdminModeChange, providerConfig, onProviderConfigChange,
}) {
  const [editingMa, setEditingMa] = useState(null);
  const [maForm, setMaForm] = useState({ date: "", time: "", mA: 0.7, mode: "Awake", notes: "" });

  // ── 5-tap admin trigger ──
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef(null);
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [passwordVal, setPasswordVal] = useState("");
  const passwordInputRef = useRef(null);

  // ── Provider config form ──
  const [provForm, setProvForm] = useState({
    descriptor: "", preparedFor: "", preparedBy: "", reviewedBy: "", contact: "",
  });
  const [showProviderForm, setShowProviderForm] = useState(false);

  // Load provider config into form when available
  useEffect(() => {
    if (providerConfig) {
      setProvForm({
        descriptor: providerConfig.descriptor || "",
        preparedFor: providerConfig.preparedFor || "",
        preparedBy: providerConfig.preparedBy || "",
        reviewedBy: providerConfig.reviewedBy || "",
        contact: providerConfig.contact || "",
      });
    }
  }, [providerConfig]);

  const handleVersionTap = () => {
    tapCountRef.current++;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    if (tapCountRef.current >= 5) {
      tapCountRef.current = 0;
      if (adminMode) {
        // Already in admin mode — deactivate
        onAdminModeChange(false);
        showToast("Session reset");
      } else {
        setShowPasswordInput(true);
        setPasswordVal("");
        setTimeout(() => {
          if (passwordInputRef.current) passwordInputRef.current.focus();
        }, 100);
      }
      return;
    }
    tapTimerRef.current = setTimeout(() => { tapCountRef.current = 0; }, 2000);
  };

  const handlePasswordSubmit = async () => {
    const ok = await checkAdminPassword(passwordVal);
    if (ok) {
      onAdminModeChange(true);
      setShowPasswordInput(false);
      setPasswordVal("");
      showToast("Extended mode activated");
    } else {
      showToast("Invalid");
      setPasswordVal("");
    }
  };

  const handleProviderSave = async () => {
    const f = provForm;
    const anyFilled = f.descriptor || f.preparedFor || f.preparedBy || f.reviewedBy || f.contact;
    const allFilled = f.descriptor && f.preparedFor && f.preparedBy && f.reviewedBy && f.contact;
    if (anyFilled && !allFilled) {
      showToast("All five fields are required if any field is filled");
      return;
    }
    if (!anyFilled) {
      // Clear provider config
      await saveProviderConfig(null);
      onProviderConfigChange(null);
      showToast("Provider configuration cleared");
    } else {
      const cfg = {
        descriptor: f.descriptor.trim(),
        preparedFor: f.preparedFor.trim(),
        preparedBy: f.preparedBy.trim(),
        reviewedBy: f.reviewedBy.trim(),
        contact: f.contact.trim(),
      };
      await saveProviderConfig(cfg);
      onProviderConfigChange(cfg);
      showToast("Provider configuration saved");
    }
    setShowProviderForm(false);
  };

  const updateSetting = async (key, val) => {
    try {
      const s = { ...settings, [key]: val };
      onUpdateSettings(s);
      await saveSettings(s);
    } catch (e) {
      console.error("Settings save error:", e);
      showToast("Could not save setting '" + key + "' — storage may be full or unavailable");
    }
  };

  const effectivePercent = Math.round(
    (safeNum(settings.masterVolume, 70) / 100) * (safeNum(settings.timerVolume, 100) / 100) * 100
  );

  // ══════════════════════════════════════════════════
  // SMART CSV IMPORT — auto-detects void vs intake
  // ══════════════════════════════════════════════════

  const handleSmartImport = async (targetType) => {
    const label = targetType === 'intake' ? 'intake' : 'voiding';
    if (!window.confirm("Import " + label + " data from CSV?\nThis adds records without removing existing ones.")) return;

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv";
    input.style.display = "none";
    document.body.appendChild(input);

    input.onchange = async (e) => {
      // Step 1: Read the file
      let text;
      try {
        const file = e.target.files[0];
        if (!file) { showToast("No file selected"); document.body.removeChild(input); return; }
        if (!file.name.toLowerCase().endsWith('.csv')) {
          showToast("Expected a .csv file but got '" + file.name + "' — please select a CSV file");
          document.body.removeChild(input); return;
        }
        text = await file.text();
      } catch (err) {
        console.error("File read error:", err);
        showToast("Could not read '" + (e.target.files[0]?.name || "file") + "' — it may be locked, corrupted, or too large");
        document.body.removeChild(input); return;
      }

      // Step 2: Split into lines
      let allLines;
      try { allLines = text.split(/\r?\n/); } catch (err) {
        showToast("Could not parse file text — unexpected encoding");
        document.body.removeChild(input); return;
      }

      if (allLines.length < 2 || !allLines[0].trim()) {
        showToast("CSV appears empty — it needs a header row plus at least one data row");
        document.body.removeChild(input); return;
      }

      // Step 3: Parse headers
      let headers;
      try { headers = parseCSVLine(allLines[0]); } catch (err) {
        showToast("Could not parse the CSV header row — check that commas separate the columns");
        document.body.removeChild(input); return;
      }

      if (headers.length < 2) {
        showToast("CSV has only " + headers.length + " column — expected at least Date and one data column. Are the columns comma-separated?");
        document.body.removeChild(input); return;
      }

      // Step 4: Detect CSV type from headers
      const detectedType = detectCSVType(headers);

      if (detectedType === 'unknown') {
        const headerList = headers.slice(0, 6).join(', ') + (headers.length > 6 ? '...' : '');
        showToast("Cannot identify this CSV format. Columns found: " + headerList + ". Expected columns like Date, Time, Vol, Acc, Init Urge (for voiding) or Date, Time, Category, Amount (for intake).");
        document.body.removeChild(input); return;
      }

      // Warn if detected type mismatches button clicked
      if (detectedType !== targetType) {
        const detectedLabel = detectedType === 'intake' ? 'an INTAKE log' : 'a VOIDING record file';
        const targetLabel = targetType === 'intake' ? 'Import Intake' : 'Import Voiding Records';
        if (!window.confirm(
          "Column mismatch detected!\n\n" +
          "This CSV looks like " + detectedLabel + " based on its headers,\n" +
          "but you clicked '" + targetLabel + "'.\n\n" +
          "Headers found: " + headers.join(', ') + "\n\n" +
          "Import as " + detectedType + " data instead?"
        )) {
          showToast("Import cancelled — no data was changed");
          document.body.removeChild(input); return;
        }
        targetType = detectedType;
      }

      // Step 5: Build column mapping
      const headerMap = targetType === 'intake' ? INTAKE_HEADER_MAP : VOID_HEADER_MAP;
      const colMap = buildColumnMap(headers, headerMap);

      if (colMap.date === undefined) {
        showToast("CSV is missing a 'Date' column — cannot import without dates. Columns found: " + headers.join(', '));
        document.body.removeChild(input); return;
      }

      const unmatchedHeaders = headers.filter(function(h) { return !headerMap[normalizeHeader(h)]; });
      console.log("Import: mapped fields:", Object.keys(colMap), "| unmatched headers:", unmatchedHeaders);

      // Step 6: Get data lines
      const dataLines = allLines.slice(1).filter(function(l) { return l.trim(); });
      if (dataLines.length === 0) {
        showToast("CSV has a header row but no data rows — nothing to import");
        document.body.removeChild(input); return;
      }

      // Step 7: Import
      try {
        if (targetType === 'intake') {
          await importIntakeCSV(colMap, dataLines, unmatchedHeaders);
        } else {
          await importVoidCSV(colMap, dataLines, unmatchedHeaders);
        }
      } catch (err) {
        console.error("Import processing error:", err);
        showToast("Import failed during row processing: " + (err.message || "Unknown error"));
      }

      document.body.removeChild(input);
    };

    input.click();
  };

  // ══════════════════════════════════════════════════
  // VOID RECORD IMPORT — per-row validation
  // ══════════════════════════════════════════════════

  const importVoidCSV = async (colMap, dataLines, unmatchedHeaders) => {
    let imported = 0, skipped = 0;
    const skipReasons = {};
    const newRecords = [];

    function skipRow(reason) { skipped++; skipReasons[reason] = (skipReasons[reason] || 0) + 1; }

    dataLines.forEach(function(line, lineNum) {
      let cols;
      try { cols = parseCSVLine(line); } catch (err) {
        skipRow("Unparseable row (line " + (lineNum + 2) + ")"); return;
      }

      const dateRaw = colVal(cols, colMap, 'date', '');
      const dateVal = normalizeDate(dateRaw);
      if (!dateVal) {
        skipRow("Invalid/unrecognized date ('" + dateRaw.slice(0, 20) + "' — expected YYYY-MM-DD or M/D/YYYY)"); return;
      }

      const timeVal = colVal(cols, colMap, 'time', '');
      if (timeVal && !isValidTime(timeVal)) {
        skipRow("Invalid time format ('" + timeVal + "' — expected HH:MM)"); return;
      }

      const volStr = colVal(cols, colMap, 'volume', '');
      const volNum = parseFloat(volStr);
      if (volStr) {
        if (isNaN(volNum)) { skipRow("Non-numeric volume ('" + volStr.slice(0, 20) + "')"); return; }
        if (volNum < 0) { skipRow("Negative volume (" + volNum + " ml)"); return; }
        if (volNum > 5000) { skipRow("Volume exceeds 5000 ml (" + volNum + ")"); return; }
      }

      const maStr = colVal(cols, colMap, 'mA', String(settings.mA));
      const maNum = safeNum(maStr, settings.mA);
      if (maNum < 0 || maNum > 10) { skipRow("mA out of range (" + maNum + " — must be 0–10)"); return; }

      const typeVal = colVal(cols, colMap, 'type', 'Standard');
      const accVal = colVal(cols, colMap, 'accident', 'No');
      const modeVal = colVal(cols, colMap, 'mode', 'Awake');

      newRecords.push({
        id: colVal(cols, colMap, 'id', '') || Date.now().toString() + Math.random().toString(36).slice(2, 6),
        date: dateVal, time: timeVal,
        volume: volStr ? String(Math.round(volNum)) : "",
        type: CONFIG.types.includes(typeVal) ? typeVal : "Standard",
        accident: CONFIG.accidents.includes(accVal) ? accVal : "No",
        initUrge: Math.max(0, Math.min(CONFIG.maxUrge, safeNum(colVal(cols, colMap, 'initUrge', '0')))),
        finalUrge: Math.max(0, Math.min(CONFIG.maxUrge, safeNum(colVal(cols, colMap, 'finalUrge', '0')))),
        deferral: colVal(cols, colMap, 'deferral', ''),
        mode: CONFIG.modes.includes(modeVal) ? modeVal : "Awake",
        mA: maNum,
        notes: colVal(cols, colMap, 'notes', ''),
        wokeMe: colVal(cols, colMap, 'wokeMe', 'No') === "Yes" ? "Yes" : "No",
      });
      imported++;
    });

    if (newRecords.length > 0) {
      try {
        const updated = [...records, ...newRecords].sort(function(a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });
        onRecordsChange(updated);
        await saveRecords(updated);
      } catch (err) {
        console.error("Save error after void import:", err);
        showToast("Parsed " + imported + " records but could not save — storage may be full. No records were added.");
        return;
      }
    }

    let msg = "✓ Imported " + imported + " voiding record" + (imported !== 1 ? "s" : "");
    if (skipped > 0) {
      const reasons = Object.entries(skipReasons).map(function(e) { return e[1] + "× " + e[0]; }).join("; ");
      msg += " · Skipped " + skipped + ": " + reasons;
    }
    if (unmatchedHeaders.length > 0) {
      msg += " · Ignored column" + (unmatchedHeaders.length > 1 ? "s" : "") + ": " + unmatchedHeaders.join(', ');
    }
    showToast(msg);
  };

  // ══════════════════════════════════════════════════
  // INTAKE RECORD IMPORT — per-row validation
  // ══════════════════════════════════════════════════

  const importIntakeCSV = async (colMap, dataLines, unmatchedHeaders) => {
    let imported = 0, skipped = 0;
    const skipReasons = {};
    const newIntakes = [];

    function skipRow(reason) { skipped++; skipReasons[reason] = (skipReasons[reason] || 0) + 1; }

    dataLines.forEach(function(line, lineNum) {
      let cols;
      try { cols = parseCSVLine(line); } catch (err) {
        skipRow("Unparseable row (line " + (lineNum + 2) + ")"); return;
      }

      const dateRaw = colVal(cols, colMap, 'date', '');
      const dateVal = normalizeDate(dateRaw);
      if (!dateVal) {
        skipRow("Invalid/unrecognized date ('" + dateRaw.slice(0, 20) + "' — expected YYYY-MM-DD or M/D/YYYY)"); return;
      }

      const timeVal = colVal(cols, colMap, 'time', '');
      if (timeVal && !isValidTime(timeVal)) {
        skipRow("Invalid time format ('" + timeVal + "' — expected HH:MM)"); return;
      }

      const catVal = colVal(cols, colMap, 'category', 'Drink');
      const category = (catVal.toLowerCase() === 'meal') ? 'Meal' : 'Drink';
      const subVal = colVal(cols, colMap, 'subtype', category === 'Meal' ? 'Snack' : 'Water');

      const amtStr = colVal(cols, colMap, 'amount', '');
      const amtNum = parseFloat(amtStr);
      if (amtStr && isNaN(amtNum)) {
        skipRow("Non-numeric amount ('" + amtStr.slice(0, 20) + "') for " + subVal + " on " + dateVal); return;
      }
      if (amtStr && amtNum < 0) {
        skipRow("Negative amount (" + amtNum + " ml) for " + subVal); return;
      }

      newIntakes.push({
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        date: dateVal, time: timeVal,
        category: category, subtype: subVal,
        amount: amtStr && !isNaN(amtNum) && amtNum >= 0 ? String(Math.round(amtNum)) : "",
        mealSize: colVal(cols, colMap, 'mealSize', ''),
        notes: colVal(cols, colMap, 'notes', ''),
      });
      imported++;
    });

    if (newIntakes.length > 0) {
      try {
        const updated = [...intakes, ...newIntakes].sort(function(a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });
        onIntakesChange(updated);
        await saveIntakes(updated);
      } catch (err) {
        console.error("Save error after intake import:", err);
        showToast("Parsed " + imported + " intake records but could not save — storage may be full. No records were added.");
        return;
      }
    }

    let msg = "✓ Imported " + imported + " intake record" + (imported !== 1 ? "s" : "");
    if (skipped > 0) {
      const reasons = Object.entries(skipReasons).map(function(e) { return e[1] + "× " + e[0]; }).join("; ");
      msg += " · Skipped " + skipped + ": " + reasons;
    }
    if (unmatchedHeaders.length > 0) {
      msg += " · Ignored column" + (unmatchedHeaders.length > 1 ? "s" : "") + ": " + unmatchedHeaders.join(', ');
    }
    showToast(msg);
  };

  // ══════════════════════════════════════════════════
  // CLEAR ALL DATA — truly everything, double-confirm
  // ══════════════════════════════════════════════════

  const handleClearAll = async () => {
    const noteCount = (doctorNotes || []).length;
    const timerCount = (timers || []).length;
    if (!window.confirm(
      "This will permanently delete:\n" +
      "• " + records.length + " voiding record" + (records.length !== 1 ? "s" : "") + "\n" +
      "• " + intakes.length + " intake record" + (intakes.length !== 1 ? "s" : "") + "\n" +
      (noteCount > 0 ? "• " + noteCount + " doctor note" + (noteCount !== 1 ? "s" : "") + "\n" : "") +
      (timerCount > 0 ? "• " + timerCount + " active timer" + (timerCount !== 1 ? "s" : "") + "\n" : "") +
      "\nContinue?"
    )) return;
    if (!window.confirm("This cannot be undone. Are you absolutely sure?")) return;

    const errors = [];
    try { onRecordsChange([]); await saveRecords([]); } catch (e) { errors.push("voiding records"); }
    try { if (onIntakesChange) { onIntakesChange([]); await saveIntakes([]); } } catch (e) { errors.push("intake records"); }
    try { await window.storage.delete(DOCTOR_NOTES_KEY); if (onDoctorNotesChange) onDoctorNotesChange([]); } catch (e) { /* may not exist */ }
    try { await window.storage.delete(TIMERS_KEY); if (onTimersChange) onTimersChange([]); } catch (e) { /* may not exist */ }
    onStartNew();

    if (errors.length > 0) {
      showToast("Cleared most data but failed to clear: " + errors.join(', ') + " — try again");
    } else {
      showToast("All data cleared — voiding records, intake logs, notes, and timers removed");
    }
  };


  // ══════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0" }}>Settings</div>
        <span onClick={handleVersionTap} style={{
          fontSize: 11, color: "#475569", cursor: "default",
          userSelect: "none", WebkitUserSelect: "none",
          padding: "4px 8px",
        }}>v{APP_VERSION}</span>
      </div>

      {/* Password input (hidden until 5-tap) */}
      {showPasswordInput && (
        <div style={{
          padding: "12px", borderRadius: 10, background: "rgba(30,41,59,0.6)",
          marginBottom: 16, border: "1px solid rgba(100,120,160,0.2)",
        }}>
          <input ref={passwordInputRef} type="password" value={passwordVal}
            onChange={e => setPasswordVal(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handlePasswordSubmit(); }}
            placeholder="Enter code..."
            style={{ ...inputStyle, padding: "8px 12px", fontSize: 14, marginBottom: 8 }} />
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={handlePasswordSubmit} style={{
              flex: 1, padding: 8, borderRadius: 8, border: "none",
              background: "#3b82f6", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>OK</button>
            <button onClick={() => { setShowPasswordInput(false); setPasswordVal(""); }} style={{
              padding: "8px 14px", borderRadius: 8, border: "none",
              background: "rgba(100,120,160,0.12)", color: "#94a3b8", fontSize: 13, cursor: "pointer",
            }}>Cancel</button>
          </div>
        </div>
      )}

      {/* ═══ Admin Mode: Provider Configuration ═══ */}
      {adminMode && (
        <div style={{
          marginBottom: 20, padding: "14px", borderRadius: 12,
          background: "rgba(190,60,120,0.08)",
          border: "1px solid rgba(190,60,120,0.2)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>Provider Configuration</div>
            <button onClick={() => setShowProviderForm(!showProviderForm)} style={{
              padding: "4px 12px", borderRadius: 8, border: "none",
              background: showProviderForm ? "rgba(239,68,68,0.15)" : "rgba(59,130,246,0.15)",
              color: showProviderForm ? "#ef4444" : "#60a5fa",
              fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>{showProviderForm ? "Cancel" : (providerConfig ? "Edit" : "+ Configure")}</button>
          </div>

          {providerConfig && !showProviderForm && (
            <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.8 }}>
              <div>This <strong style={{ color: "#e2e8f0" }}>{providerConfig.descriptor}</strong> has been prepared specifically for <strong style={{ color: "#e2e8f0" }}>{providerConfig.preparedFor}</strong> by <strong style={{ color: "#e2e8f0" }}>{providerConfig.preparedBy}</strong>.</div>
              <div>This configuration has been reviewed by <strong style={{ color: "#e2e8f0" }}>{providerConfig.reviewedBy}</strong>.</div>
              <div>If you have questions or concerns, please contact <strong style={{ color: "#e2e8f0" }}>{providerConfig.contact}</strong>.</div>
            </div>
          )}

          {showProviderForm && (
            <div>
              <Field label="Descriptor">
                <input value={provForm.descriptor} onChange={e => setProvForm(f => ({...f, descriptor: e.target.value}))}
                  placeholder="e.g. voiding diary, treatment log..." style={{ ...inputStyle, padding: "8px 12px", fontSize: 13 }} />
              </Field>
              <Field label="Prepared specifically for">
                <input value={provForm.preparedFor} onChange={e => setProvForm(f => ({...f, preparedFor: e.target.value}))}
                  placeholder="Patient name..." style={{ ...inputStyle, padding: "8px 12px", fontSize: 13 }} />
              </Field>
              <Field label="Prepared by">
                <input value={provForm.preparedBy} onChange={e => setProvForm(f => ({...f, preparedBy: e.target.value}))}
                  placeholder="Doctor name..." style={{ ...inputStyle, padding: "8px 12px", fontSize: 13 }} />
              </Field>
              <Field label="Reviewed by">
                <input value={provForm.reviewedBy} onChange={e => setProvForm(f => ({...f, reviewedBy: e.target.value}))}
                  placeholder="Reviewer name..." style={{ ...inputStyle, padding: "8px 12px", fontSize: 13 }} />
              </Field>
              <Field label="Contact (phone or email)">
                <input value={provForm.contact} onChange={e => setProvForm(f => ({...f, contact: e.target.value}))}
                  placeholder="Phone number or email..." style={{ ...inputStyle, padding: "8px 12px", fontSize: 13 }} />
              </Field>
              <div style={{ fontSize: 11, color: "#475569", marginBottom: 10 }}>
                If any field is filled, all five fields are required. Leave all blank to clear.
              </div>
              <button onClick={handleProviderSave} style={{
                width: "100%", padding: 10, borderRadius: 10, border: "none",
                background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer",
              }}>Save Configuration</button>
            </div>
          )}
        </div>
      )}

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

      {/* Void Tolerance Target */}
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
        <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0", marginBottom: 12 }}>Sound & Notifications</div>

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

        <Field label={`Repeat Interval: every ${safeNum(settings.chimeRepeatInterval, 30)}s`}>
          <div style={{ display: "flex", gap: 6 }}>
            {CHIME_INTERVAL_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => updateSetting("chimeRepeatInterval", opt.value)}
                style={{
                  flex: 1, padding: "8px 0", borderRadius: 8, border: "none",
                  background: safeNum(settings.chimeRepeatInterval, 30) === opt.value ? "#60a5fa" : "rgba(100,120,160,0.12)",
                  color: safeNum(settings.chimeRepeatInterval, 30) === opt.value ? "#fff" : "#94a3b8",
                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}>{opt.label}</button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 6 }}>
            How often the chime repeats after a countdown timer expires.
          </div>
        </Field>

        <Field label={`Repeat Duration: ${safeNum(settings.chimeRepeatDuration, 2) === 0 ? "Single chime (no repeat)" : safeNum(settings.chimeRepeatDuration, 2) + " min"}`}>
          <input type="range" min="0" max="10" step="1" value={safeNum(settings.chimeRepeatDuration, 2)}
            onChange={e => updateSetting("chimeRepeatDuration", parseInt(e.target.value))}
            style={{ width: "100%", accentColor: "#f59e0b" }} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
            <span style={{ fontSize: 10, color: "#64748b" }}>Off</span>
            <span style={{ fontSize: 10, color: "#64748b" }}>10 min</span>
          </div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>
            How long the chime repeats (escalating volume/frequency). 0 = single chime.
          </div>
        </Field>

        <button onClick={() => {
          if (window.playTestChime) { window.playTestChime(settings); showToast("Chime played at " + effectivePercent + "% volume"); }
          else { showToast("Audio engine not available — browser may be blocking sound"); }
        }} style={{
          width: "100%", padding: 12, borderRadius: 12, border: "1px solid rgba(96,165,250,0.3)",
          background: "rgba(96,165,250,0.08)", color: "#60a5fa",
          fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}><span style={{ fontSize: 18 }}>🔔</span> Test Chime</button>
      </div>

      {/* ═══ mA History Editor ═══ */}
      <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid rgba(100,120,160,0.15)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>mA History</div>
          <button onClick={() => { setEditingMa("new"); setMaForm({ date: localDate(), time: localTime(), mA: settings.mA, mode: settings.mode, notes: "" }); }} style={{
            padding: "6px 12px", borderRadius: 8, border: "none",
            background: "rgba(34,197,94,0.15)", color: "#22c55e", fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>+ Add</button>
        </div>

        {maHistory.map((h, i) => (
          <div key={i} style={{ padding: "8px 12px", borderRadius: 10, background: "rgba(30,41,59,0.4)", marginBottom: 6, borderLeft: "3px solid #a78bfa" }}>
            {editingMa === i ? (
              <div>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input type="date" value={maForm.date} onChange={e => setMaForm(f => ({...f, date: e.target.value}))}
                    style={{ ...inputStyle, flex: 1, padding: "6px 8px", fontSize: 13 }} />
                  <input type="time" value={maForm.time || ""} onChange={e => setMaForm(f => ({...f, time: e.target.value}))}
                    style={{ ...inputStyle, width: 100, padding: "6px 8px", fontSize: 13 }} />
                  <input type="number" step="0.1" value={maForm.mA} onChange={e => setMaForm(f => ({...f, mA: parseFloat(e.target.value) || 0}))}
                    style={{ ...inputStyle, width: 70, padding: "6px 8px", fontSize: 13 }} />
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <PillSelect options={CONFIG.modes} value={maForm.mode} onChange={v => setMaForm(f => ({...f, mode: v}))}
                    color={maForm.mode === "Asleep" ? "#8b5cf6" : "#60a5fa"} />
                </div>
                <input value={maForm.notes} onChange={e => setMaForm(f => ({...f, notes: e.target.value}))}
                  placeholder="Notes..." style={{ ...inputStyle, padding: "6px 8px", fontSize: 13, marginBottom: 8 }} />
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={async () => {
                    try { const updated = maHistory.map((entry, j) => j === i ? {...maForm} : entry); onMaHistoryChange(updated); await saveMaHistory(updated); setEditingMa(null); showToast("mA entry updated"); }
                    catch (e) { showToast("Could not save mA change — please try again"); }
                  }} style={{ flex: 1, padding: 8, borderRadius: 8, border: "none", background: "#3b82f6", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Save</button>
                  <button onClick={async () => {
                    try { const updated = maHistory.filter((_, j) => j !== i); onMaHistoryChange(updated); await saveMaHistory(updated); setEditingMa(null); showToast("mA entry deleted"); }
                    catch (e) { showToast("Could not delete mA entry — please try again"); }
                  }} style={{ padding: 8, borderRadius: 8, border: "none", background: "rgba(239,68,68,0.15)", color: "#ef4444", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Delete</button>
                  <button onClick={() => setEditingMa(null)} style={{ padding: 8, borderRadius: 8, border: "none", background: "rgba(100,120,160,0.12)", color: "#94a3b8", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div onClick={() => { setEditingMa(i); setMaForm({...h, time: h.time || ""}); }} style={{ display: "flex", justifyContent: "space-between", cursor: "pointer" }}>
                <span style={{ color: "#94a3b8", fontSize: 13 }}>
                  {new Date(h.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  {h.time && <span style={{ color: "#64748b" }}> {fmtTime(h.time)}</span>}
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

        {editingMa === "new" && (
          <div style={{ padding: "10px 12px", borderRadius: 10, background: "rgba(30,41,59,0.4)", marginBottom: 6, borderLeft: "3px solid #22c55e" }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input type="date" value={maForm.date} onChange={e => setMaForm(f => ({...f, date: e.target.value}))}
                style={{ ...inputStyle, flex: 1, padding: "6px 8px", fontSize: 13 }} />
              <input type="time" value={maForm.time || ""} onChange={e => setMaForm(f => ({...f, time: e.target.value}))}
                style={{ ...inputStyle, width: 100, padding: "6px 8px", fontSize: 13 }} />
              <input type="number" step="0.1" value={maForm.mA} onChange={e => setMaForm(f => ({...f, mA: parseFloat(e.target.value) || 0}))}
                style={{ ...inputStyle, width: 70, padding: "6px 8px", fontSize: 13 }} />
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <PillSelect options={CONFIG.modes} value={maForm.mode} onChange={v => setMaForm(f => ({...f, mode: v}))}
                color={maForm.mode === "Asleep" ? "#8b5cf6" : "#60a5fa"} />
            </div>
            <input value={maForm.notes} onChange={e => setMaForm(f => ({...f, notes: e.target.value}))}
              placeholder="Notes..." style={{ ...inputStyle, padding: "6px 8px", fontSize: 13, marginBottom: 8 }} />
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={async () => {
                if (!maForm.date) { showToast("Date is required for mA history entry"); return; }
                try { const updated = [...maHistory, {...maForm}].sort((a, b) => ((a.date||"")+(a.time||"")).localeCompare((b.date||"")+(b.time||""))); onMaHistoryChange(updated); await saveMaHistory(updated); setEditingMa(null); showToast("mA entry added"); }
                catch (e) { showToast("Could not save new mA entry — please try again"); }
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

        <button onClick={() => {
          if (records.length === 0) { showToast("No voiding records to export"); return; }
          try { exportCSV(records); showToast("Exported " + records.length + " voiding records"); }
          catch (e) { showToast("Export failed — browser may have blocked the download"); }
        }} style={{
          width: "100%", padding: 14, borderRadius: 12, border: "none",
          background: "rgba(96,165,250,0.15)", color: "#60a5fa",
          fontSize: 15, fontWeight: 600, cursor: "pointer", marginBottom: 10, fontFamily: "'DM Sans', sans-serif",
        }}>Export Voiding Records (CSV)</button>

        <button onClick={() => {
          if (intakes.length === 0) { showToast("No intake records to export"); return; }
          try {
            const headers = ["Date","Time","Category","Type","Amount (ml)","Size","Notes"];
            const rows = intakes.map(function(i) {
              return [i.date, i.time, i.category, i.subtype, i.amount, i.mealSize || "", '"' + (i.notes || "").replace(/"/g, '""') + '"'];
            });
            const csv = [headers.join(",")].concat(rows.map(function(r) { return r.join(","); })).join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url;
            a.download = "neuro-log-intakes-" + new Date().toISOString().slice(0, 10) + ".csv";
            a.click(); URL.revokeObjectURL(url);
            showToast("Exported " + intakes.length + " intake records");
          } catch (e) { showToast("Intake export failed — browser may have blocked the download"); }
        }} style={{
          width: "100%", padding: 14, borderRadius: 12, border: "none",
          background: "rgba(249,115,22,0.1)", color: "#f97316",
          fontSize: 15, fontWeight: 600, cursor: "pointer", marginBottom: 10, fontFamily: "'DM Sans', sans-serif",
        }}>Export Intake Log (CSV)</button>

        <button onClick={() => handleSmartImport('void')} style={{
          width: "100%", padding: 14, borderRadius: 12, border: "none",
          background: "rgba(34,197,94,0.1)", color: "#22c55e",
          fontSize: 15, fontWeight: 600, cursor: "pointer", marginBottom: 10, fontFamily: "'DM Sans', sans-serif",
        }}>Import Voiding Records (CSV)</button>

        <button onClick={() => handleSmartImport('intake')} style={{
          width: "100%", padding: 14, borderRadius: 12, border: "none",
          background: "rgba(249,115,22,0.08)", color: "#fb923c",
          fontSize: 15, fontWeight: 600, cursor: "pointer", marginBottom: 10, fontFamily: "'DM Sans', sans-serif",
        }}>Import Intake Log (CSV)</button>

        <button onClick={handleClearAll} style={{
          width: "100%", padding: 14, borderRadius: 12, border: "none",
          background: "rgba(239,68,68,0.1)", color: "#ef4444",
          fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
        }}>Clear All Data</button>

        <div style={{ fontSize: 11, color: "#475569", marginTop: 8, padding: "8px 0" }}>
          Import auto-detects whether a CSV contains voiding records or intake data based on column headers. If you pick the wrong button, it will warn you before importing.
        </div>
      </div>
      <div style={{ height: 40 }} />
    </>
  );
};
