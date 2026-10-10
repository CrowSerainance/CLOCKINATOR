import { useState } from "react";
import { theme } from "../theme";
import { useStore, useStoreRevision } from "../hooks/useClockinator";
import { toDateInput } from "../domain/duration";
import { btn, card, fieldStyle, pagePad } from "../components/ui";

export function Expenses() {
  const store = useStore();
  useStoreRevision();
  const rows = store.listExpenses();
  const projects = store.listActiveProjects();
  const [projectId, setProjectId] = useState("");
  const [category, setCategory] = useState("Travel");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(store.workspacePolicy().currency);
  const [spentOn, setSpentOn] = useState(toDateInput(new Date()));
  const [note, setNote] = useState("");
  const [billable, setBillable] = useState(false);
  const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);

  return (
    <div style={pagePad}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 14 }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>Expenses</div>
        <div style={{ fontSize: 13, color: theme.textMuted }}>{rows.length} entries · {total.toFixed(2)} mixed currency</div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={fieldStyle}>
          <option value="">No project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" style={fieldStyle} />
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" style={{ ...fieldStyle, width: 90 }} />
        <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} style={{ ...fieldStyle, width: 70 }} />
        <input type="date" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} style={fieldStyle} />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" style={fieldStyle} />
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={billable} onChange={(e) => setBillable(e.target.checked)} />
          Billable
        </label>
        <button
          onClick={() => {
            if (!category.trim() || !amount.trim()) return;
            store.createExpense({ projectId: projectId || null, category, amount, currency, spentOn, note, billable });
            setAmount("");
            setNote("");
          }}
          style={btn(theme.accent, theme.accentInk)}
        >
          Add
        </button>
      </div>
      <div style={card}>
        {rows.map((row) => (
          <div key={row.id} style={{ display: "grid", gridTemplateColumns: "90px 1fr 1fr 100px 1fr 70px", gap: 10, padding: "11px 18px", borderTop: `1px solid ${theme.border}`, alignItems: "center", fontSize: 13 }}>
            <span className="mono">{row.spentOn}</span>
            <span style={{ fontWeight: 600 }}>{row.category}</span>
            <span style={{ color: theme.textMuted }}>{row.project}</span>
            <span className="mono">
              {row.amount} {row.currency}
            </span>
            <span style={{ color: theme.textFaint }}>{row.user}{row.billable ? " · billable" : ""}</span>
            <button onClick={() => store.deleteExpense(row.id)} style={btn(theme.surfaceAlt, theme.danger, { padding: "4px 8px" })}>
              Delete
            </button>
          </div>
        ))}
        {rows.length === 0 && <div style={{ padding: 24, color: theme.textMuted, fontSize: 13 }}>No expenses yet. Amounts in other currencies use the workspace exchange table.</div>}
      </div>
    </div>
  );
}
