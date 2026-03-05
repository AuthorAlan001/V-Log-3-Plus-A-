// ═══════════════════════════════════════════════════
// SHARED.JS — Storage, Constants, Data, Utilities
// V Log Plus — Neuro-Stim Voiding Diary v3.1.0
// ═══════════════════════════════════════════════════

// ── App Version (single source of truth) ──
window.APP_VERSION = "3.1.0";

// ── IndexedDB Storage Shim ──
(function() {
  const DB_NAME = 'vlog-plus-db';
  const OLD_DB_NAME = 'neuro-stim-db';
  const STORE_NAME = 'kv';
  const MIGRATION_KEY = '_migrated-from-neuro-stim';
  let db = null;

  function openNamedDB(name) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function openDB() {
    return new Promise((resolve, reject) => {
      if (db) { resolve(db); return; }
      openNamedDB(DB_NAME).then(d => { db = d; resolve(db); }).catch(reject);
    });
  }

  // One-time migration: copy all data from old 'neuro-stim-db' to new 'vlog-plus-db'
  window._migrateFromOldDB = async function() {
    try {
      const newDB = await openDB();
      // Check if already migrated
      const checkTx = newDB.transaction(STORE_NAME, 'readonly');
      const checkReq = checkTx.objectStore(STORE_NAME).get(MIGRATION_KEY);
      const alreadyDone = await new Promise(resolve => {
        checkReq.onsuccess = () => resolve(checkReq.result !== undefined);
        checkReq.onerror = () => resolve(false);
      });
      if (alreadyDone) return { migrated: false, reason: 'already done' };

      // Check if new DB already has real data (e.g. user already started using 3.1)
      const keysTx = newDB.transaction(STORE_NAME, 'readonly');
      const keysReq = keysTx.objectStore(STORE_NAME).getAllKeys();
      const existingKeys = await new Promise(resolve => {
        keysReq.onsuccess = () => resolve(keysReq.result || []);
        keysReq.onerror = () => resolve([]);
      });
      if (existingKeys.length > 0) {
        // Mark as migrated so we don't check again
        const markTx = newDB.transaction(STORE_NAME, 'readwrite');
        markTx.objectStore(STORE_NAME).put(true, MIGRATION_KEY);
        return { migrated: false, reason: 'new db already has data' };
      }

      // Try to open old DB and read all data
      let oldDB;
      try { oldDB = await openNamedDB(OLD_DB_NAME); } catch(e) {
        return { migrated: false, reason: 'old db not found' };
      }

      const readTx = oldDB.transaction(STORE_NAME, 'readonly');
      const store = readTx.objectStore(STORE_NAME);
      const allKeys = await new Promise((resolve, reject) => {
        const req = store.getAllKeys();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });

      if (allKeys.length === 0) {
        oldDB.close();
        const markTx = newDB.transaction(STORE_NAME, 'readwrite');
        markTx.objectStore(STORE_NAME).put(true, MIGRATION_KEY);
        return { migrated: false, reason: 'old db empty' };
      }

      // Read all values from old DB
      const allData = [];
      for (const key of allKeys) {
        const val = await new Promise((resolve, reject) => {
          const rTx = oldDB.transaction(STORE_NAME, 'readonly');
          const req = rTx.objectStore(STORE_NAME).get(key);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        allData.push({ key, value: val });
      }
      oldDB.close();

      // Write all data to new DB
      const writeTx = newDB.transaction(STORE_NAME, 'readwrite');
      const writeStore = writeTx.objectStore(STORE_NAME);
      for (const item of allData) {
        writeStore.put(item.value, item.key);
      }
      writeStore.put(true, MIGRATION_KEY);
      await new Promise((resolve, reject) => {
        writeTx.oncomplete = () => resolve();
        writeTx.onerror = () => reject(writeTx.error);
      });

      console.log('[V Log Plus] Migrated ' + allData.length + ' keys from ' + OLD_DB_NAME);
      return { migrated: true, count: allData.length };
    } catch(e) {
      console.warn('[V Log Plus] Migration failed (non-fatal):', e);
      return { migrated: false, reason: 'error', error: e };
    }
  };

  window.storage = {
    async get(key) {
      const d = await openDB();
      return new Promise((resolve, reject) => {
        const tx = d.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => req.result !== undefined ? resolve({ key, value: req.result }) : reject(new Error('not found'));
        req.onerror = () => reject(req.error);
      });
    },
    async set(key, value) {
      const d = await openDB();
      return new Promise((resolve, reject) => {
        const tx = d.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(value, key);
        tx.oncomplete = () => resolve({ key, value });
        tx.onerror = () => reject(tx.error);
      });
    },
    async delete(key) {
      const d = await openDB();
      return new Promise((resolve, reject) => {
        const tx = d.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(key);
        tx.oncomplete = () => resolve({ key, deleted: true });
        tx.onerror = () => reject(tx.error);
      });
    },
    async list(prefix) {
      const d = await openDB();
      return new Promise((resolve, reject) => {
        const tx = d.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).getAllKeys();
        req.onsuccess = () => {
          let keys = req.result || [];
          if (prefix) keys = keys.filter(k => k.startsWith(prefix));
          resolve({ keys });
        };
        req.onerror = () => reject(req.error);
      });
    }
  };
})();

// ── Storage Keys ──
window.STORAGE_KEY = "neuro-log-records-v2";
window.SETTINGS_KEY = "neuro-log-settings";
window.SEED_KEY = "neuro-log-seeded";
window.MA_HISTORY_KEY = "neuro-log-ma-history-v2";
window.INTAKE_KEY = "neuro-log-intake-v1";
window.DOCTOR_NOTES_KEY = "neuro-log-doctor-notes-v1";
window.TIMERS_KEY = "neuro-log-active-timers-v1";

// ── Configuration ──
window.CONFIG = {
  types: ["Standard", "Repeat", "With BM", "TEST"],
  accidents: ["No", "Yes", "Minor"],
  modes: ["Awake", "Asleep"],
  maxUrge: 4,
  urgeStep: 0.1,
};

window.DRINK_TYPES = ["Water", "Coffee", "Tea", "Soda", "Juice", "Alcohol", "Other"];
window.MEAL_TYPES = ["Breakfast", "Lunch", "Dinner", "Snack"];
window.DRINK_PRESETS = [
  { label: "8oz", ml: 237 },
  { label: "12oz", ml: 355 },
  { label: "16oz", ml: 473 },
  { label: "20oz", ml: 591 },
  { label: "32oz", ml: 946 },
];
window.MEAL_SIZES = ["Small", "Medium", "Large", "Jumbo"];

window.DEFAULT_FILTERS = { accident: "All", mA: "All", wokeMe: "All", dateRange: "All", customFrom: "", customTo: "" };

window.defaultSettings = { mA: 0.7, mode: "Awake", targetDeferral: 5 };

// ── Tab Configuration ──
window.TABS = [
  { id: "form", icon: "✏️" },
  { id: "list", icon: "📋" },
  { id: "stats", icon: "📊" },
  { id: "intake", icon: "🥤" },
  { id: "report", icon: "🩺" },
  { id: "settings", icon: "⚙️" },
];

// ── Initial Data ──
window.INITIAL_MA_HISTORY = [
  { date: "2026-02-28", mA: 0.6, mode: "Awake", notes: "Initial Setup" },
  { date: "2026-03-01", mA: 0.7, mode: "Awake", notes: "Changed from 0.6 to 0.7 at 10:39" },
];

window.INITIAL_RECORDS = [
  // === 0.6 mA era ===
  {id:"p1",date:"2026-02-28",time:"07:55",volume:"100",type:"Standard",accident:"No",wokeMe:"No",initUrge:0,finalUrge:0,deferral:"",mode:"Awake",mA:0.6,notes:""},
  {id:"p2",date:"2026-02-28",time:"19:00",volume:"100",type:"Standard",accident:"No",wokeMe:"No",initUrge:1,finalUrge:3,deferral:"2",mode:"Awake",mA:0.6,notes:""},
  {id:"p3",date:"2026-02-28",time:"20:22",volume:"100",type:"Standard",accident:"No",wokeMe:"No",initUrge:1,finalUrge:2,deferral:"1",mode:"Awake",mA:0.6,notes:""},
  {id:"p4",date:"2026-03-01",time:"01:10",volume:"250",type:"Standard",accident:"No",wokeMe:"No",initUrge:1,finalUrge:2,deferral:"2",mode:"Asleep",mA:0.6,notes:""},
  {id:"p5",date:"2026-03-01",time:"02:00",volume:"100",type:"Standard",accident:"No",wokeMe:"No",initUrge:1,finalUrge:0,deferral:"",mode:"Asleep",mA:0.6,notes:"Drank 8 oz water with 2 Tylenol"},
  {id:"p6",date:"2026-03-01",time:"03:26",volume:"260",type:"Standard",accident:"No",wokeMe:"No",initUrge:1,finalUrge:0,deferral:"",mode:"Asleep",mA:0.6,notes:""},
  {id:"p7",date:"2026-03-01",time:"07:35",volume:"200",type:"Standard",accident:"No",wokeMe:"Yes",initUrge:1,finalUrge:0,deferral:"0",mode:"Asleep",mA:0.6,notes:"Woke me"},
  // === Changed to 0.7 mA at 10:39 ===
  {id:"p8",date:"2026-03-01",time:"10:45",volume:"200",type:"Standard",accident:"No",wokeMe:"No",initUrge:1,finalUrge:0,deferral:"0",mode:"Awake",mA:0.7,notes:"First void after mA change"},
  {id:"p9",date:"2026-03-01",time:"13:00",volume:"100",type:"Standard",accident:"No",wokeMe:"No",initUrge:0,finalUrge:0,deferral:"30",mode:"Awake",mA:0.7,notes:""},
  {id:"p10",date:"2026-03-01",time:"16:50",volume:"380",type:"Standard",accident:"No",wokeMe:"No",initUrge:2,finalUrge:0,deferral:"2",mode:"Awake",mA:0.7,notes:""},
  {id:"p11",date:"2026-03-01",time:"19:15",volume:"150",type:"Standard",accident:"No",wokeMe:"No",initUrge:1,finalUrge:2,deferral:"1",mode:"Awake",mA:0.7,notes:""},
  {id:"p12",date:"2026-03-01",time:"23:05",volume:"290",type:"Standard",accident:"No",wokeMe:"No",initUrge:0,finalUrge:2,deferral:"10",mode:"Awake",mA:0.7,notes:""},
  {id:"p13",date:"2026-03-02",time:"00:50",volume:"100",type:"Standard",accident:"No",wokeMe:"No",initUrge:1,finalUrge:0,deferral:"1",mode:"Asleep",mA:0.7,notes:""},
  {id:"p14",date:"2026-03-02",time:"02:30",volume:"420",type:"Standard",accident:"No",wokeMe:"Yes",initUrge:2,finalUrge:0,deferral:"0",mode:"Asleep",mA:0.7,notes:"Woke me"},
  {id:"p15",date:"2026-03-02",time:"04:09",volume:"300",type:"Standard",accident:"No",wokeMe:"Yes",initUrge:2,finalUrge:0,deferral:"0",mode:"Asleep",mA:0.7,notes:"Woke me"},
  {id:"p16",date:"2026-03-02",time:"06:26",volume:"200",type:"Standard",accident:"No",wokeMe:"Yes",initUrge:2,finalUrge:0,deferral:"0",mode:"Asleep",mA:0.7,notes:"Woke me"},
  {id:"p17",date:"2026-03-02",time:"07:26",volume:"100",type:"Standard",accident:"No",wokeMe:"No",initUrge:2,finalUrge:0,deferral:"2",mode:"Awake",mA:0.7,notes:""},
  {id:"p18",date:"2026-03-02",time:"14:30",volume:"200",type:"Standard",accident:"No",wokeMe:"No",initUrge:0,finalUrge:0,deferral:"",mode:"Awake",mA:0.7,notes:""},
  {id:"p19",date:"2026-03-02",time:"15:30",volume:"150",type:"Standard",accident:"No",wokeMe:"No",initUrge:0,finalUrge:0,deferral:"",mode:"Awake",mA:0.7,notes:""},
  // === Previously imported from spreadsheets ===
  {id:"1",date:"2026-02-24",time:"11:57",volume:"100",type:"Standard",accident:"No",wokeMe:"No",initUrge:0,finalUrge:1,deferral:"",mode:"Awake",mA:0.6,notes:""},
  {id:"2",date:"2026-02-26",time:"11:58",volume:"250",type:"Repeat",accident:"No",wokeMe:"No",initUrge:1,finalUrge:1,deferral:"",mode:"Awake",mA:0.6,notes:""},
  {id:"3",date:"2026-02-27",time:"11:59",volume:"150",type:"TEST",accident:"No",wokeMe:"No",initUrge:1,finalUrge:0,deferral:"",mode:"Awake",mA:0.6,notes:""},
  {id:"4",date:"2026-02-28",time:"11:59",volume:"340",type:"TEST",accident:"No",wokeMe:"No",initUrge:1,finalUrge:0,deferral:"",mode:"Awake",mA:0.6,notes:""},
  {id:"5",date:"2026-03-02",time:"04:34",volume:"350",type:"Repeat",accident:"No",wokeMe:"No",initUrge:2,finalUrge:3,deferral:"1",mode:"Asleep",mA:0.7,notes:""},
  {id:"6",date:"2026-03-02",time:"12:05",volume:"200",type:"Standard",accident:"No",wokeMe:"No",initUrge:1,finalUrge:3,deferral:"1",mode:"Awake",mA:0.7,notes:""},
  {id:"7",date:"2026-03-02",time:"12:12",volume:"200",type:"TEST",accident:"No",wokeMe:"No",initUrge:1,finalUrge:3,deferral:"",mode:"Awake",mA:0.7,notes:""},
  {id:"8",date:"2026-03-02",time:"12:30",volume:"200",type:"TEST",accident:"No",wokeMe:"No",initUrge:1,finalUrge:2,deferral:"1",mode:"Awake",mA:0.7,notes:""},
  {id:"9",date:"2026-03-02",time:"12:39",volume:"100",type:"TEST",accident:"Yes",wokeMe:"No",initUrge:1,finalUrge:3,deferral:"7",mode:"Awake",mA:0.7,notes:""},
  {id:"10",date:"2026-03-02",time:"12:40",volume:"300",type:"TEST",accident:"No",wokeMe:"No",initUrge:1,finalUrge:2,deferral:"",mode:"Awake",mA:0.7,notes:""},
  {id:"11",date:"2026-03-02",time:"13:08",volume:"300",type:"Repeat",accident:"Yes",wokeMe:"No",initUrge:1,finalUrge:2,deferral:"2",mode:"Awake",mA:0.7,notes:""},
  {id:"12",date:"2026-03-02",time:"13:21",volume:"170",type:"TEST",accident:"Minor",wokeMe:"No",initUrge:1,finalUrge:2,deferral:"2",mode:"Awake",mA:0.7,notes:""},
  {id:"13",date:"2026-03-02",time:"15:07",volume:"200",type:"Standard",accident:"No",wokeMe:"No",initUrge:1,finalUrge:3,deferral:"5",mode:"Awake",mA:0.7,notes:""},
  {id:"14",date:"2026-03-02",time:"17:38",volume:"225",type:"Standard",accident:"No",wokeMe:"No",initUrge:1,finalUrge:3,deferral:"3",mode:"Awake",mA:0.7,notes:"Ate dinner at 7:30 pm"},
  {id:"15",date:"2026-03-02",time:"17:38",volume:"120",type:"Standard",accident:"No",wokeMe:"No",initUrge:0,finalUrge:0,deferral:"",mode:"Awake",mA:0.7,notes:"Took two Tylenol with full glass of water at 9 pm."},
  {id:"16",date:"2026-03-02",time:"20:15",volume:"225",type:"Standard",accident:"No",wokeMe:"No",initUrge:1,finalUrge:1,deferral:"1",mode:"Awake",mA:0.7,notes:""},
  {id:"17",date:"2026-03-03",time:"01:03",volume:"400",type:"Standard",accident:"No",wokeMe:"No",initUrge:1,finalUrge:3,deferral:"1",mode:"Awake",mA:0.7,notes:"I was awake so I tried to go to the bathroom before bed"},
  {id:"18",date:"2026-03-03",time:"02:46",volume:"120",type:"Standard",accident:"No",wokeMe:"No",initUrge:0,finalUrge:1,deferral:"5",mode:"Asleep",mA:0.7,notes:"Woke up"},
  {id:"19",date:"2026-03-03",time:"04:46",volume:"300",type:"Standard",accident:"No",wokeMe:"No",initUrge:2,finalUrge:3,deferral:"1",mode:"Asleep",mA:0.7,notes:"Woke up"},
  {id:"20",date:"2026-03-03",time:"08:30",volume:"",type:"Standard",accident:"No",wokeMe:"Yes",initUrge:2,finalUrge:2,deferral:"",mode:"Asleep",mA:0.7,notes:""},
  {id:"21",date:"2026-03-03",time:"08:30",volume:"300",type:"Standard",accident:"No",wokeMe:"Yes",initUrge:1,finalUrge:2,deferral:"",mode:"Asleep",mA:0.7,notes:""},
  {id:"22",date:"2026-03-03",time:"08:30",volume:"300",type:"Standard",accident:"No",wokeMe:"No",initUrge:1,finalUrge:2,deferral:"",mode:"Awake",mA:0.7,notes:"testing"},
];

// ── Date/Time Helpers (LOCAL timezone, not UTC) ──
window.localDate = function() {
  var d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
};
window.localTime = function() {
  var d = new Date();
  return String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0");
};

// ── Utility Functions ──
window.safeNum = function(v, fallback) {
  if (fallback === undefined) fallback = 0;
  var n = parseFloat(v);
  return isNaN(n) || !isFinite(n) ? fallback : n;
};

window.fmt = function(d) {
  if (!d) return "";
  var dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

window.fmtTime = function(t) {
  if (!t) return "";
  var parts = t.split(":");
  var hr = parseInt(parts[0]);
  var m = parts[1];
  var ampm = hr >= 12 ? "PM" : "AM";
  return (hr % 12 || 12) + ":" + m + " " + ampm;
};

window.fmtElapsed = function(s) {
  var m = Math.floor(s / 60);
  var sec = s % 60;
  return m + ":" + sec.toString().padStart(2, "0");
};

window.emptyRecord = function() {
  return {
    id: Date.now().toString(),
    date: localDate(),
    time: localTime(),
    volume: "",
    type: "Standard",
    accident: "No",
    wokeMe: "No",
    initUrge: 1,
    finalUrge: 0,
    deferral: "",
    mode: "Awake",
    mA: 0.7,
    notes: "",
  };
};

// ── Storage Operations ──
window.loadRecords = async function() {
  try {
    var r = await window.storage.get(STORAGE_KEY);
    if (r) {
      var parsed = JSON.parse(r.value);
      if (!Array.isArray(parsed)) throw new Error("Invalid records data");
      return parsed.map(function(rec) {
        return {
          id: rec.id || Date.now().toString(),
          date: rec.date || new Date().toISOString().slice(0, 10),
          time: rec.time || "",
          volume: rec.volume != null ? String(rec.volume) : "",
          type: CONFIG.types.includes(rec.type) ? rec.type : "Standard",
          accident: CONFIG.accidents.includes(rec.accident) ? rec.accident : "No",
          wokeMe: rec.wokeMe === "Yes" ? "Yes" : "No",
          initUrge: Math.max(0, Math.min(CONFIG.maxUrge, safeNum(rec.initUrge))),
          finalUrge: Math.max(0, Math.min(CONFIG.maxUrge, safeNum(rec.finalUrge))),
          deferral: rec.deferral != null ? String(rec.deferral) : "",
          mode: CONFIG.modes.includes(rec.mode) ? rec.mode : "Awake",
          mA: safeNum(rec.mA, 0.7),
          notes: rec.notes || "",
        };
      });
    }
  } catch (e) { console.error("Load error, reseeding:", e); }
  try {
    var sorted = INITIAL_RECORDS.slice().sort(function(a,b) { return (a.date+a.time).localeCompare(b.date+b.time); });
    await window.storage.set(STORAGE_KEY, JSON.stringify(sorted));
    return sorted;
  } catch(e) {
    return INITIAL_RECORDS.slice().sort(function(a,b) { return (a.date+a.time).localeCompare(b.date+b.time); });
  }
};

window.saveRecords = async function(records) {
  try { await window.storage.set(STORAGE_KEY, JSON.stringify(records)); }
  catch (e) { console.error("Save failed:", e); }
};

window.loadSettings = async function() {
  try {
    var r = await window.storage.get(SETTINGS_KEY);
    var s = r ? JSON.parse(r.value) : defaultSettings;
    // Ensure targetDeferral exists (migration from older versions)
    if (s.targetDeferral === undefined) s.targetDeferral = 5;
    return s;
  } catch(e) { return Object.assign({}, defaultSettings); }
};

window.saveSettings = async function(s) {
  try { await window.storage.set(SETTINGS_KEY, JSON.stringify(s)); } catch(e) {}
};

window.loadMaHistory = async function() {
  try {
    var r = await window.storage.get(MA_HISTORY_KEY);
    if (r) return JSON.parse(r.value);
  } catch(e) {}
  try {
    await window.storage.set(MA_HISTORY_KEY, JSON.stringify(INITIAL_MA_HISTORY));
    return INITIAL_MA_HISTORY.slice();
  } catch(e) { return INITIAL_MA_HISTORY.slice(); }
};

window.saveMaHistory = async function(h) {
  try { await window.storage.set(MA_HISTORY_KEY, JSON.stringify(h)); } catch(e) {}
};

window.loadIntakes = async function() {
  try {
    var r = await window.storage.get(INTAKE_KEY);
    if (r) {
      var parsed = JSON.parse(r.value);
      if (!Array.isArray(parsed)) throw new Error("Invalid intake data");
      return parsed.map(function(i) {
        return {
          id: i.id || Date.now().toString(),
          date: i.date || "",
          time: i.time || "",
          category: i.category === "Meal" ? "Meal" : "Drink",
          subtype: i.subtype || (i.category === "Meal" ? "Snack" : "Water"),
          amount: i.amount != null ? String(i.amount) : "",
          mealSize: i.mealSize || "",
          notes: i.notes || "",
        };
      });
    }
    return [];
  } catch(e) { return []; }
};

window.saveIntakes = async function(list) {
  try { await window.storage.set(INTAKE_KEY, JSON.stringify(list)); } catch(e) {}
};

window.loadDoctorNotes = async function() {
  try {
    var r = await window.storage.get(DOCTOR_NOTES_KEY);
    if (r) return JSON.parse(r.value);
    return [];
  } catch(e) { return []; }
};

window.saveDoctorNotes = async function(notes) {
  try { await window.storage.set(DOCTOR_NOTES_KEY, JSON.stringify(notes)); } catch(e) {}
};

window.loadTimers = async function() {
  try {
    var r = await window.storage.get(TIMERS_KEY);
    if (r) return JSON.parse(r.value);
    return [];
  } catch(e) { return []; }
};

window.saveTimers = async function(timers) {
  try { await window.storage.set(TIMERS_KEY, JSON.stringify(timers)); } catch(e) {}
};

// ── CSV Export ──
window.exportCSV = function(records) {
  var headers = ["ID","Date","Time","Vol","Type","Acc","Init Urge","Final Urge","Def","Mode","mA","Notes","Woke Me"];
  var rows = records.map(function(r) {
    return [r.id, r.date, r.time, r.volume, r.type, r.accident,
      r.initUrge, r.finalUrge, r.deferral, r.mode, r.mA,
      '"' + (r.notes||"").replace(/"/g,'""') + '"', r.wokeMe];
  });
  var csv = [headers.join(",")].concat(rows.map(function(r) { return r.join(","); })).join("\n");
  var blob = new Blob([csv], { type: "text/csv" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = "neuro-log-" + new Date().toISOString().slice(0,10) + ".csv";
  a.click();
  URL.revokeObjectURL(url);
};

// ── Filter Logic (shared between list and report) ──
window.applyFilters = function(records, filters) {
  var today = new Date();
  var dateFrom = null, dateTo = null;
  if (filters.dateRange === "7") {
    dateFrom = new Date(today); dateFrom.setDate(dateFrom.getDate() - 6);
  } else if (filters.dateRange === "10") {
    dateFrom = new Date(today); dateFrom.setDate(dateFrom.getDate() - 9);
  } else if (filters.dateRange === "30") {
    dateFrom = new Date(today); dateFrom.setDate(dateFrom.getDate() - 29);
  } else if (filters.dateRange === "Custom") {
    if (filters.customFrom) dateFrom = new Date(filters.customFrom + "T00:00:00");
    if (filters.customTo) dateTo = new Date(filters.customTo + "T23:59:59");
  }
  var dateFromStr = dateFrom ? dateFrom.toISOString().slice(0, 10) : null;
  var dateToStr = dateTo ? dateTo.toISOString().slice(0, 10) : null;

  return records.filter(function(r) {
    if (dateFromStr && r.date < dateFromStr) return false;
    if (dateToStr && r.date > dateToStr) return false;
    if (filters.accident !== "All") {
      if (filters.accident === "Any" && r.accident === "No") return false;
      if (filters.accident !== "Any" && r.accident !== filters.accident) return false;
    }
    if (filters.mA !== "All" && String(r.mA) !== filters.mA) return false;
    if (filters.wokeMe !== "All" && r.wokeMe !== filters.wokeMe) return false;
    return true;
  });
};

window.isFiltered = function(filters) {
  return JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);
};

window.getFilterDesc = function(filters) {
  return Object.entries(filters)
    .filter(function(entry) { return entry[1] !== "All" && entry[1] !== "" && entry[0] !== "customFrom" && entry[0] !== "customTo"; })
    .map(function(entry) {
      if (entry[0] === "dateRange") return entry[1] === "Custom" ? (filters.customFrom || "?") + "–" + (filters.customTo || "?") : "Last " + entry[1] + " days";
      return entry[0] + ": " + entry[1];
    }).join(", ");
};

// ── Shared Styles ──
window.inputStyle = {
  width: "100%", padding: "10px 12px", borderRadius: 10,
  border: "1px solid rgba(100,120,160,0.2)", background: "rgba(15,23,42,0.4)",
  color: "#e2e8f0", fontSize: 16, fontFamily: "'DM Sans', sans-serif",
  outline: "none", boxSizing: "border-box",
};

window.navBtnStyle = {
  padding: "8px 16px", borderRadius: 10, border: "none",
  background: "rgba(100,120,160,0.12)", color: "#94a3b8",
  fontSize: 13, fontWeight: 600, cursor: "pointer",
  fontFamily: "'DM Sans', sans-serif",
};

window.chartTooltipStyle = {
  contentStyle: { background: "#1e293b", border: "1px solid rgba(100,120,160,0.3)", borderRadius: 10, fontSize: 12, color: "#e2e8f0" },
  labelStyle: { color: "#94a3b8" },
};
