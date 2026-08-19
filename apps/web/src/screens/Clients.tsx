import { useState } from "react";
import { theme } from "../theme";
import { useStore, useStoreRevision } from "../hooks/useClockinator";
import { btn, card, fieldStyle, pagePad } from "../components/ui";

export function Clients() {
  const store = useStore();
  useStoreRevision();
  const rows = store.listClientRows();
  const [name, setName] = useState("");

  return (
    <div style={pagePad}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>Clients</div>
        <div style={{ flex: 1 }} />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New client name" style={{ ...fieldStyle, width: 220 }} />
        <button
          onClick={() => {
            if (name.trim()) {
              store.createClient(name.trim());
              setName("");
            }
          }}
          style={btn(theme.accent, theme.accentInk)}
        >
          + Add client
        </button>
      </div>
      <div style={card}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr",
            gap: 12,
            padding: "12px 18px",
            fontSize: 11,
            fontWeight: 700,
            color: theme.textFaint,
            letterSpacing: ".06em",
            background: theme.surfaceAlt,
          }}
        >
          <span>NAME</span>
          <span>PROJECTS</span>
          <span>TRACKED</span>
        </div>
        {rows.map((row) => (
          <div
            key={row.id}
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr",
              gap: 12,
              padding: "12px 18px",
              borderTop: `1px solid ${theme.border}`,
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600 }}>{row.name}</span>
            <span style={{ fontSize: 13, color: theme.textMuted }}>{row.projects}</span>
            <span className="mono" style={{ fontSize: 13 }}>{row.tracked}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
