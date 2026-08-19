import { useState } from "react";
import { theme, projectColors } from "../theme";
import { useStore, useStoreRevision } from "../hooks/useClockinator";
import { btn, card, fieldStyle, pagePad } from "../components/ui";

export function Tags() {
  const store = useStore();
  useStoreRevision();
  const rows = store.listTagRows();
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(projectColors[0]);

  return (
    <div style={pagePad}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>Tags</div>
        <div style={{ flex: 1 }} />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New tag" style={{ ...fieldStyle, width: 180 }} />
        <div style={{ display: "flex", gap: 6 }}>
          {projectColors.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: c,
                border: color === c ? `2px solid ${theme.text}` : "2px solid transparent",
                cursor: "pointer",
              }}
            />
          ))}
        </div>
        <button
          onClick={() => {
            if (name.trim()) {
              store.createTag(name.trim(), color);
              setName("");
            }
          }}
          style={btn(theme.accent, theme.accentInk)}
        >
          + Add tag
        </button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {rows.map((row) => (
          <div key={row.id} style={{ ...card, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, minWidth: 180 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: row.color }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{row.name}</div>
              <div style={{ fontSize: 12, color: theme.textMuted }}>{row.uses} entries</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
