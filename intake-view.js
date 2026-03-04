// ═══════════════════════════════════════════════════
// INTAKE-VIEW.JS — Fluid & Meal Intake Tracking
// ═══════════════════════════════════════════════════


window.IntakeView = function IntakeView({ intakes, onIntakesChange, showToast }) {
  const today = localDate();
  const defaultForm = { category: "Drink", subtype: "Water", amount: "", notes: "", unit: "oz", mealSize: "", date: localDate(), time: localTime() };

  const [intakeForm, setIntakeForm] = useState(defaultForm);
  const [editingIntake, setEditingIntake] = useState(null);

  const todayIntakes = intakes.filter(i => i.date === today);
  const todayDrinks = todayIntakes.filter(i => i.category === "Drink");
  const todayMeals = todayIntakes.filter(i => i.category === "Meal");
  const todayFluidMl = todayDrinks.reduce((s, i) => s + safeNum(i.amount), 0);
  const todayFluidOz = Math.round(todayFluidMl / 29.574);

  const handleSave = async () => {
    if (intakeForm.category === "Drink" && (!intakeForm.amount || parseFloat(intakeForm.amount) <= 0)) {
      showToast("Please enter an amount");
      return;
    }
    try {
      let amountMl = "";
      if (intakeForm.category === "Drink") {
        const raw = parseFloat(intakeForm.amount) || 0;
        amountMl = String(intakeForm.unit === "oz" ? Math.round(raw * 29.574) : raw);
      }
      const entry = {
        id: Date.now().toString(),
        date: intakeForm.date || localDate(),
        time: intakeForm.time || localTime(),
        category: intakeForm.category,
        subtype: intakeForm.subtype,
        amount: amountMl,
        mealSize: intakeForm.category === "Meal" ? intakeForm.mealSize : "",
        notes: intakeForm.notes,
      };
      let updated;
      if (editingIntake !== null) {
        updated = intakes.map((item, idx) => idx === editingIntake ? { ...entry, id: item.id } : item);
        setEditingIntake(null);
        showToast("Entry updated");
      } else {
        updated = [...intakes, entry];
        showToast("Logged");
      }
      onIntakesChange(updated);
      await saveIntakes(updated);
      setIntakeForm(defaultForm);
    } catch (e) {
      console.error("Intake save error:", e);
      showToast("Save failed");
    }
  };

  const deleteIntake = async (idx) => {
    try {
      const updated = intakes.filter((_, i) => i !== idx);
      onIntakesChange(updated);
      await saveIntakes(updated);
      if (editingIntake === idx) { setEditingIntake(null); setIntakeForm(defaultForm); }
      showToast("Deleted");
    } catch(e) { showToast("Delete failed"); }
  };

  return (
    <>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>Intake Log</div>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>
        Today: {todayFluidOz} oz ({todayFluidMl} ml) · {todayMeals.length} meals
      </div>

      {/* Category toggle */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {["Drink", "Meal"].map(cat => (
          <button key={cat} onClick={() => setIntakeForm(f => ({
            ...f, category: cat,
            subtype: cat === "Drink" ? "Water" : "Breakfast",
            amount: cat === "Meal" ? "" : f.amount,
          }))} style={{
            flex: 1, padding: 10, borderRadius: 10, border: "none",
            background: intakeForm.category === cat ? (cat === "Drink" ? "#3b82f6" : "#f59e0b") : "rgba(100,120,160,0.12)",
            color: intakeForm.category === cat ? "#fff" : "#94a3b8",
            fontSize: 14, fontWeight: 700, cursor: "pointer",
          }}>{cat === "Drink" ? "🥤 Drink" : "🍽️ Meal"}</button>
        ))}
      </div>

      {/* Date/time */}
      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <Field label="Date">
            <input type="date" value={intakeForm.date} onChange={e => setIntakeForm(f => ({...f, date: e.target.value}))} style={inputStyle} />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Time">
            <input type="time" value={intakeForm.time} onChange={e => setIntakeForm(f => ({...f, time: e.target.value}))} style={inputStyle} />
          </Field>
        </div>
      </div>

      {/* Subtype pills */}
      <Field label={intakeForm.category === "Drink" ? "Beverage" : "Meal"}>
        <PillSelect
          options={intakeForm.category === "Drink" ? DRINK_TYPES : MEAL_TYPES}
          value={intakeForm.subtype}
          onChange={v => setIntakeForm(f => ({ ...f, subtype: v }))}
          color={intakeForm.category === "Drink" ? "#3b82f6" : "#f59e0b"}
        />
      </Field>

      {/* Amount for drinks */}
      {intakeForm.category === "Drink" && (
        <>
          <Field label={`Amount (${intakeForm.unit})`}>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="number" inputMode="decimal" value={intakeForm.amount}
                onChange={e => setIntakeForm(f => ({ ...f, amount: e.target.value }))}
                placeholder={intakeForm.unit === "oz" ? "e.g. 12" : "e.g. 355"}
                style={{ ...inputStyle, flex: 1, fontSize: 18, fontWeight: 700, fontFamily: "'DM Mono', monospace" }} />
              <div style={{ display: "flex", borderRadius: 10, overflow: "hidden" }}>
                {["oz", "ml"].map(u => (
                  <button key={u} onClick={() => setIntakeForm(f => ({ ...f, unit: u, amount: "" }))} style={{
                    padding: "8px 14px", border: "none",
                    background: intakeForm.unit === u ? "#3b82f6" : "rgba(100,120,160,0.12)",
                    color: intakeForm.unit === u ? "#fff" : "#94a3b8",
                    fontSize: 13, fontWeight: 600, cursor: "pointer",
                  }}>{u}</button>
                ))}
              </div>
            </div>
          </Field>
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            {DRINK_PRESETS.map(p => (
              <button key={p.label} onClick={() => setIntakeForm(f => ({
                ...f,
                amount: f.unit === "oz" ? String(parseFloat(p.label)) : String(p.ml),
                unit: f.unit,
              }))} style={{
                padding: "6px 12px", borderRadius: 8, border: "none",
                background: "rgba(59,130,246,0.1)", color: "#60a5fa",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}>{p.label}</button>
            ))}
            <button onClick={() => setIntakeForm(f => ({ ...f, amount: "" }))} style={{
              padding: "6px 12px", borderRadius: 8, border: "none",
              background: "rgba(59,130,246,0.1)", color: "#60a5fa",
              fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>Other</button>
          </div>
          {intakeForm.amount && (
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12, marginTop: -8 }}>
              {intakeForm.unit === "oz"
                ? `= ${Math.round(parseFloat(intakeForm.amount || 0) * 29.574)} ml`
                : `= ${(parseFloat(intakeForm.amount || 0) / 29.574).toFixed(1)} oz`}
            </div>
          )}
        </>
      )}

      {/* Meal size */}
      {intakeForm.category === "Meal" && (
        <Field label="Portion Size">
          <PillSelect options={MEAL_SIZES} value={intakeForm.mealSize}
            onChange={v => setIntakeForm(f => ({ ...f, mealSize: v }))}
            color="#f59e0b" />
        </Field>
      )}

      {/* Notes */}
      <Field label="Notes (optional)">
        <input value={intakeForm.notes} onChange={e => setIntakeForm(f => ({ ...f, notes: e.target.value }))}
          placeholder="e.g. with Tylenol" style={inputStyle} />
      </Field>

      {/* Save button */}
      <button onClick={handleSave} style={{
        width: "100%", padding: 14, borderRadius: 14, border: "none",
        background: editingIntake !== null
          ? "linear-gradient(135deg, #22c55e, #16a34a)"
          : intakeForm.category === "Drink"
            ? "linear-gradient(135deg, #3b82f6, #2563eb)"
            : "linear-gradient(135deg, #f59e0b, #d97706)",
        color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer",
        fontFamily: "'DM Sans', sans-serif",
        boxShadow: "0 4px 16px rgba(0,0,0,0.2)", marginBottom: 20,
      }}>{editingIntake !== null ? "Update Entry" : `Log ${intakeForm.category}`}</button>

      {editingIntake !== null && (
        <button onClick={() => { setEditingIntake(null); setIntakeForm(defaultForm); }} style={{
          width: "100%", padding: 10, borderRadius: 10, border: "none",
          background: "rgba(100,120,160,0.12)", color: "#94a3b8",
          fontSize: 13, cursor: "pointer", marginBottom: 20,
        }}>Cancel Edit</button>
      )}

      {/* Today's log */}
      <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Today</div>
      {todayIntakes.length === 0 && (
        <div style={{ color: "#475569", fontSize: 13, textAlign: "center", padding: 20 }}>Nothing logged yet today</div>
      )}
      {[...todayIntakes].reverse().map((item) => {
        const idx = intakes.indexOf(item);
        return (
          <div key={item.id} style={{
            padding: "10px 12px", borderRadius: 10, background: "rgba(30,41,59,0.5)",
            marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center",
            borderLeft: `3px solid ${item.category === "Drink" ? "#3b82f6" : "#f59e0b"}`,
          }}>
            <div onClick={() => { setEditingIntake(idx); setIntakeForm({ category: item.category, subtype: item.subtype, amount: item.category === "Drink" ? String(Math.round((parseFloat(item.amount)||0)/29.574)) : "", notes: item.notes || "", unit: "oz", mealSize: item.mealSize || "", date: item.date || localDate(), time: item.time || localTime() }); }}
              style={{ cursor: "pointer", flex: 1 }}>
              <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 600 }}>
                {item.subtype}
                {item.amount && <span style={{ color: "#64748b", fontWeight: 400 }}> · {Math.round(parseFloat(item.amount) / 29.574)}oz ({item.amount}ml)</span>}
                {item.mealSize && <span style={{ color: "#f59e0b", fontWeight: 400 }}> · {item.mealSize}</span>}
              </div>
              <div style={{ fontSize: 11, color: "#475569", marginTop: 1 }}>
                {fmtTime(item.time)}
                {item.notes && ` · ${item.notes}`}
              </div>
            </div>
            <button onClick={() => deleteIntake(idx)} style={{
              padding: "4px 8px", borderRadius: 6, border: "none",
              background: "rgba(239,68,68,0.1)", color: "#ef4444",
              fontSize: 11, cursor: "pointer", marginLeft: 8,
            }}>✕</button>
          </div>
        );
      })}

      {/* Previous days summary */}
      {(() => {
        const otherDays = {};
        intakes.forEach(i => {
          if (i.date === today) return;
          if (!otherDays[i.date]) otherDays[i.date] = { drinks: 0, fluidMl: 0, meals: 0 };
          if (i.category === "Drink") { otherDays[i.date].drinks++; otherDays[i.date].fluidMl += safeNum(i.amount); }
          else otherDays[i.date].meals++;
        });
        const days = Object.keys(otherDays).sort().reverse();
        if (days.length === 0) return null;
        return (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Previous Days</div>
            {days.map(d => (
              <div key={d} style={{
                display: "flex", justifyContent: "space-between", padding: "8px 12px",
                borderRadius: 8, background: "rgba(30,41,59,0.3)", marginBottom: 4,
              }}>
                <span style={{ color: "#94a3b8", fontSize: 12 }}>{fmt(d)}</span>
                <span style={{ color: "#e2e8f0", fontSize: 12, fontFamily: "'DM Mono', monospace" }}>
                  {otherDays[d].fluidMl}ml · {otherDays[d].drinks} drinks · {otherDays[d].meals} meals
                </span>
              </div>
            ))}
          </div>
        );
      })()}
      <div style={{ height: 40 }} />
    </>
  );
};
