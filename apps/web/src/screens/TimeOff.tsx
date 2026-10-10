import { useState } from "react";
import { theme } from "../theme";
import { useStore, useStoreRevision } from "../hooks/useClockinator";
import { toDateInput } from "../domain/duration";
import { btn, card, fieldStyle, pagePad } from "../components/ui";

export function TimeOff() {
  const store = useStore();
  useStoreRevision();
  const rows = store.listTimeOff();
  const users = store.listUsers();
  const managing = store.canManage();
  const [userId, setUserId] = useState(store.userId);
  const [policy, setPolicy] = useState("vacation");
  const [startDate, setStartDate] = useState(toDateInput(new Date()));
  const [endDate, setEndDate] = useState(toDateInput(new Date()));
  const [hours, setHours] = useState("8");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  return (
    <div style={pagePad}>
      <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 14 }}>Time off</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {managing && (
          <select value={userId} onChange={(e) => setUserId(e.target.value)} style={fieldStyle}>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        )}
        <select value={policy} onChange={(e) => setPolicy(e.target.value)} style={fieldStyle}>
          <option value="vacation">Vacation</option>
          <option value="sick">Sick</option>
          <option value="personal">Personal</option>
        </select>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={fieldStyle} />
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={fieldStyle} />
        <input value={hours} onChange={(e) => setHours(e.target.value)} style={{ ...fieldStyle, width: 70 }} />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" style={fieldStyle} />
        <button
          onClick={() => {
            try {
              setError("");
              store.requestTimeOff({ userId, policy, startDate, endDate, hoursPerDay: hours, note });
              setNote("");
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            }
          }}
          style={btn(theme.accent, theme.accentInk)}
        >
          Request
        </button>
      </div>
      {error && <div style={{ color: theme.danger, fontSize: 12, marginBottom: 10 }}>{error}</div>}
      <div style={card}>
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr 0.8fr 0.8fr 0.7fr 140px", gap: 10, padding: "12px 18px", fontSize: 11, fontWeight: 700, color: theme.textFaint, background: theme.surfaceAlt }}>
          <span>PERSON</span>
          <span>POLICY</span>
          <span>FROM</span>
          <span>TO</span>
          <span>STATUS</span>
          <span />
        </div>
        {rows.map((row) => (
          <div key={row.id} style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr 0.8fr 0.8fr 0.7fr 140px", gap: 10, padding: "11px 18px", borderTop: `1px solid ${theme.border}`, alignItems: "center", fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>{row.user}</span>
            <span style={{ textTransform: "capitalize", color: theme.textMuted }}>{row.policy}</span>
            <span className="mono">{row.startDate}</span>
            <span className="mono">{row.endDate}</span>
            <span style={{ textTransform: "capitalize", color: row.status === "approved" ? theme.accent : row.status === "rejected" ? theme.danger : "#e0b15c" }}>{row.status}</span>
            {managing && row.status === "requested" ? (
              <span style={{ display: "flex", gap: 6 }}>
                <button onClick={() => store.setTimeOffStatus(row.id, "approved")} style={btn(theme.accent, theme.accentInk, { padding: "4px 8px" })}>
                  Approve
                </button>
                <button onClick={() => store.setTimeOffStatus(row.id, "rejected")} style={btn(theme.surfaceAlt, theme.danger, { padding: "4px 8px" })}>
                  Reject
                </button>
              </span>
            ) : (
              <span style={{ color: theme.textFaint }}>{row.note}</span>
            )}
          </div>
        ))}
        {rows.length === 0 && <div style={{ padding: 24, color: theme.textMuted, fontSize: 13 }}>No time off yet.</div>}
      </div>
    </div>
  );
}
