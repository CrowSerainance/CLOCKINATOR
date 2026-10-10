import { useState } from "react";
import { theme } from "../theme";
import { useStore, useStoreRevision } from "../hooks/useClockinator";
import { btn, card, fieldStyle, pagePad } from "../components/ui";

export function Team() {
  const store = useStore();
  useStoreRevision();
  const users = store.listUsers();
  const [selected, setSelected] = useState(users[0]?.id ?? "");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"manager" | "member">("member");
  const [cost, setCost] = useState("0");
  const [error, setError] = useState("");
  const fields = store.fieldValues(selected, "user");

  return (
    <div style={pagePad}>
      <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Team</div>
      <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 16 }}>
        Owners and managers can approve time, lock weeks, and add time for other people.
      </div>
      <div style={card}>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.4fr 0.8fr 0.7fr", gap: 12, padding: "12px 18px", fontSize: 11, fontWeight: 700, color: theme.textFaint, letterSpacing: ".06em", background: theme.surfaceAlt }}>
          <span>NAME</span>
          <span>EMAIL</span>
          <span>ROLE</span>
          <span>COST / h</span>
        </div>
        {users.map((user) => (
          <UserRow key={user.id} user={user} selected={selected === user.id} onSelect={() => setSelected(user.id)} />
        ))}
      </div>

      {selected && fields.length > 0 && (
        <div style={{ ...card, padding: 16, marginTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>User fields</div>
          {fields.map((field) => (
            <label key={field.fieldId} style={{ display: "block", marginBottom: 8, fontSize: 12, color: theme.textMuted }}>
              {field.name}
              <input
                defaultValue={field.value}
                onBlur={(e) => store.setFieldValue(field.fieldId, selected, e.target.value)}
                style={{ ...fieldStyle, width: "100%", marginTop: 4 }}
              />
            </label>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" style={fieldStyle} />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" style={fieldStyle} />
        <select value={role} onChange={(e) => setRole(e.target.value as "manager" | "member")} style={fieldStyle}>
          <option value="member">Member</option>
          <option value="manager">Manager</option>
        </select>
        <input value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Cost" style={{ ...fieldStyle, width: 80 }} />
        <button
          onClick={() => {
            try {
              setError("");
              store.createUser({ name, email, role, costRate: cost });
              setName("");
              setEmail("");
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            }
          }}
          style={btn(theme.accent, theme.accentInk)}
        >
          Add teammate
        </button>
      </div>
      {error && <div style={{ color: theme.danger, fontSize: 12, marginTop: 8 }}>{error}</div>}
    </div>
  );
}

function UserRow({
  user,
  selected,
  onSelect,
}: {
  user: { id: string; name: string; email: string; role: string; costRate: string };
  selected: boolean;
  onSelect: () => void;
}) {
  const store = useStore();
  const [role, setRole] = useState(user.role);
  const [cost, setCost] = useState(user.costRate);
  const [name, setName] = useState(user.name);
  return (
    <div
      onClick={onSelect}
      style={{
        display: "grid",
        gridTemplateColumns: "1.4fr 1.4fr 0.8fr 0.7fr",
        gap: 12,
        padding: "10px 18px",
        borderTop: `1px solid ${theme.border}`,
        alignItems: "center",
        background: selected ? theme.accent + "12" : "transparent",
      }}
    >
      <input value={name} onChange={(e) => setName(e.target.value)} onClick={(e) => e.stopPropagation()} style={fieldStyle} />
      <span style={{ fontSize: 13, color: theme.textMuted }}>{user.email}</span>
      <select
        value={role}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          const next = e.target.value as "owner" | "manager" | "member";
          setRole(next);
          store.updateUser(user.id, { role: next, costRate: cost, name });
        }}
        style={fieldStyle}
      >
        <option value="owner">Owner</option>
        <option value="manager">Manager</option>
        <option value="member">Member</option>
      </select>
      <input
        value={cost}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setCost(e.target.value)}
        onBlur={() => store.updateUser(user.id, { role: role as "owner" | "manager" | "member", costRate: cost, name })}
        style={fieldStyle}
      />
    </div>
  );
}
