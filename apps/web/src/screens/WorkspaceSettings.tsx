import { useState } from "react";
import { theme } from "../theme";
import { useStore, useStoreRevision } from "../hooks/useClockinator";
import { btn, card, fieldStyle, pagePad } from "../components/ui";
import type { Screen } from "../types";

const PAGES: Array<{ id: Screen; label: string }> = [
  { id: "timesheet", label: "Timesheet" },
  { id: "calendar", label: "Calendar" },
  { id: "schedule", label: "Schedule" },
  { id: "reports", label: "Reports" },
  { id: "projects", label: "Projects" },
  { id: "clients", label: "Clients" },
  { id: "tags", label: "Tags" },
  { id: "invoices", label: "Invoices" },
  { id: "expenses", label: "Expenses" },
  { id: "timeoff", label: "Time off" },
  { id: "approvals", label: "Approvals" },
  { id: "audit", label: "Audit log" },
  { id: "team", label: "Team" },
];

export function WorkspaceSettings() {
  const store = useStore();
  useStoreRevision();
  const policy = store.workspacePolicy();
  const [roundingMinutes, setRoundingMinutes] = useState(String(policy.roundingMinutes));
  const [roundingMode, setRoundingMode] = useState(policy.roundingMode);
  const [requireDescription, setRequireDescription] = useState(policy.requireDescription);
  const [requireProject, setRequireProject] = useState(policy.requireProject);
  const [requireTask, setRequireTask] = useState(policy.requireTask);
  const [requireTag, setRequireTag] = useState(policy.requireTag);
  const [targetHours, setTargetHours] = useState(String(policy.weeklyTargetSeconds / 3600));
  const [forceTimer, setForceTimer] = useState(policy.forceTimer);
  const [hideOthers, setHideOthers] = useState(policy.hideOthersTime);
  const [hideRates, setHideRates] = useState(policy.hideRates);
  const [hidden, setHidden] = useState<string[]>(policy.hideMemberPages);
  const [fieldName, setFieldName] = useState("");
  const [fieldTarget, setFieldTarget] = useState("time_entry");
  const [fieldType, setFieldType] = useState("text");
  const [fieldRequired, setFieldRequired] = useState(false);
  const [fieldOptions, setFieldOptions] = useState("");
  const [currency, setCurrency] = useState("");
  const [rate, setRate] = useState("");
  const [message, setMessage] = useState("");
  const fields = store.listFieldDefs();
  const rates = store.listCurrencies();

  const save = () => {
    try {
      store.saveWorkspacePolicy({
        roundingMinutes: Number(roundingMinutes) || 0,
        roundingMode,
        requireDescription,
        requireProject,
        requireTask,
        requireTag,
        weeklyTargetHours: Number(targetHours) || 0,
        forceTimer,
        hideMemberPages: hidden,
        hideOthersTime: hideOthers,
        hideRates,
      });
      setMessage("Saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const togglePage = (id: string) => {
    setHidden((current) => (current.includes(id) ? current.filter((page) => page !== id) : [...current, id]));
  };

  return (
    <div style={pagePad}>
      <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Workspace</div>
      <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 16 }}>
        Local rules for required fields, who can see time, rounding, and the weekly target. Base currency is {policy.currency}.
      </div>

      <div style={{ ...card, padding: 18, marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Time entry rules</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 12 }}>
          <Check label="Description" checked={requireDescription} onChange={setRequireDescription} />
          <Check label="Project" checked={requireProject} onChange={setRequireProject} />
          <Check label="Task" checked={requireTask} onChange={setRequireTask} />
          <Check label="Tag" checked={requireTag} onChange={setRequireTag} />
          <Check label="Force timer for members" checked={forceTimer} onChange={setForceTimer} />
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <label style={{ fontSize: 13, color: theme.textMuted }}>
            Round to
            <input value={roundingMinutes} onChange={(e) => setRoundingMinutes(e.target.value)} style={{ ...fieldStyle, width: 70, marginLeft: 8 }} />
            <span style={{ marginLeft: 6 }}>min</span>
          </label>
          <select value={roundingMode} onChange={(e) => setRoundingMode(e.target.value as typeof roundingMode)} style={fieldStyle}>
            <option value="nearest">Nearest</option>
            <option value="up">Up</option>
            <option value="down">Down</option>
          </select>
          <label style={{ fontSize: 13, color: theme.textMuted }}>
            Weekly target
            <input value={targetHours} onChange={(e) => setTargetHours(e.target.value)} style={{ ...fieldStyle, width: 70, marginLeft: 8 }} />
            <span style={{ marginLeft: 6 }}>h</span>
          </label>
        </div>
      </div>

      <div style={{ ...card, padding: 18, marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Hide time and pages from members</div>
        <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
          <Check label="Hide teammates' time" checked={hideOthers} onChange={setHideOthers} />
          <Check label="Hide rates and amounts" checked={hideRates} onChange={setHideRates} />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {PAGES.map((page) => (
            <button
              key={page.id}
              onClick={() => togglePage(page.id)}
              style={btn(hidden.includes(page.id) ? theme.accent + "22" : theme.surfaceAlt, hidden.includes(page.id) ? theme.text : theme.textMuted, {
                border: `1px solid ${hidden.includes(page.id) ? theme.accent : theme.border}`,
              })}
            >
              {hidden.includes(page.id) ? `Hidden: ${page.label}` : page.label}
            </button>
          ))}
        </div>
      </div>

      <button onClick={save} style={btn(theme.accent, theme.accentInk)}>
        Save rules
      </button>
      {message && <span style={{ marginLeft: 12, fontSize: 13, color: theme.textMuted }}>{message}</span>}

      <div style={{ ...card, padding: 18, marginTop: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Custom fields and user fields</div>
        {fields.map((field) => (
          <div key={field.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", borderTop: `1px solid ${theme.border}`, fontSize: 13 }}>
            <span style={{ flex: 1 }}>{field.name}</span>
            <span style={{ color: theme.textFaint }}>{field.target}</span>
            <span style={{ color: theme.textFaint }}>{field.fieldType}{field.required ? " · required" : ""}</span>
            <button onClick={() => store.deleteFieldDef(field.id)} style={btn(theme.surfaceAlt, theme.danger, { padding: "4px 8px" })}>
              Remove
            </button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <input value={fieldName} onChange={(e) => setFieldName(e.target.value)} placeholder="Field name" style={fieldStyle} />
          <select value={fieldTarget} onChange={(e) => setFieldTarget(e.target.value)} style={fieldStyle}>
            <option value="time_entry">Time entry</option>
            <option value="user">User</option>
            <option value="project">Project</option>
            <option value="client">Client</option>
          </select>
          <select value={fieldType} onChange={(e) => setFieldType(e.target.value)} style={fieldStyle}>
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="date">Date</option>
            <option value="boolean">Yes / no</option>
            <option value="select">Select</option>
          </select>
          <input value={fieldOptions} onChange={(e) => setFieldOptions(e.target.value)} placeholder="Options, comma separated" style={fieldStyle} />
          <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={fieldRequired} onChange={(e) => setFieldRequired(e.target.checked)} />
            Required
          </label>
          <button
            onClick={() => {
              if (!fieldName.trim()) return;
              store.saveFieldDef({ target: fieldTarget, name: fieldName, fieldType, required: fieldRequired, options: fieldOptions });
              setFieldName("");
              setFieldOptions("");
            }}
            style={btn(theme.surfaceAlt, theme.text)}
          >
            Add field
          </button>
        </div>
      </div>

      <div style={{ ...card, padding: 18, marginTop: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Exchange rates → {policy.currency}</div>
        {rates.map((row) => (
          <div key={row.currency} style={{ fontSize: 13, padding: "4px 0", color: theme.textMuted }}>
            1 {row.currency} = {row.rateToBase} {policy.currency}
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="EUR" style={{ ...fieldStyle, width: 90 }} />
          <input value={rate} onChange={(e) => setRate(e.target.value)} placeholder="1.08" style={{ ...fieldStyle, width: 100 }} />
          <button
            onClick={() => {
              if (currency.trim() && rate.trim()) {
                store.setCurrencyRate(currency, rate);
                setCurrency("");
                setRate("");
              }
            }}
            style={btn(theme.surfaceAlt, theme.text)}
          >
            Save rate
          </button>
        </div>
      </div>
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
