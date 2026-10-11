import { useState } from "react";
import { theme } from "../theme";
import { useStore, useStoreRevision } from "../hooks/useClockinator";
import { downloadTextFile, toCsv } from "../domain/reports";
import { btn, card, fieldStyle, pagePad } from "../components/ui";

export function AuditLog() {
  const store = useStore();
  useStoreRevision();
  const [query, setQuery] = useState("");
  const [timeOnly, setTimeOnly] = useState(false);
  const all = store.listAudit();
  const q = query.trim().toLowerCase();
  const rows = all.filter((row) => {
    if (timeOnly && !row.action.startsWith("time_entry") && row.targetType !== "time_entry") return false;
    if (!q) return true;
    return `${row.action} ${row.actor} ${row.targetType} ${row.targetId} ${row.detail}`.toLowerCase().includes(q);
  });

  return (
    <div style={pagePad}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>Audit Log</div>
        <div style={{ fontSize: 13, color: theme.textMuted }}>{rows.length} events</div>
        <div style={{ flex: 1 }} />
        <button onClick={() => setTimeOnly((value) => !value)} style={btn(timeOnly ? theme.accent + "22" : theme.surfaceAlt, theme.text, { fontSize: 12 })}>
          Time changes
        </button>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" style={fieldStyle} />
        <button
          onClick={() =>
            downloadTextFile(
              "clockinator-audit.csv",
              toCsv(
                ["when", "action", "actor", "target", "id", "detail"],
                rows.map((row) => [row.createdAt, row.action, row.actor, row.targetType, row.targetId, row.detail]),
              ),
              "text/csv;charset=utf-8",
            )
          }
          style={btn(theme.surfaceAlt, theme.text)}
        >
          Export
        </button>
      </div>
      <div style={card}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "140px 1.1fr 0.7fr 0.7fr 1.4fr",
            gap: 12,
            padding: "12px 18px",
            fontSize: 11,
            fontWeight: 700,
            color: theme.textFaint,
            letterSpacing: ".06em",
            background: theme.surfaceAlt,
          }}
        >
          <span>WHEN</span>
          <span>ACTION</span>
          <span>ACTOR</span>
          <span>TARGET</span>
          <span>DETAIL</span>
        </div>
        {rows.map((row) => (
          <div
            key={row.id}
            style={{
              display: "grid",
              gridTemplateColumns: "140px 1.1fr 0.7fr 0.7fr 1.4fr",
              gap: 12,
              padding: "11px 18px",
              borderTop: `1px solid ${theme.border}`,
              alignItems: "center",
            }}
          >
            <span className="mono" style={{ fontSize: 12, color: theme.textMuted }}>{row.createdAt}</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{row.action}</span>
            <span style={{ fontSize: 13, color: theme.textMuted }}>{row.actor}</span>
            <span style={{ fontSize: 13, color: theme.textMuted }}>{row.targetType}</span>
            <span style={{ fontSize: 12, color: theme.textFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.detail || row.targetId}</span>
          </div>
        ))}
        {rows.length === 0 && (
          <div style={{ padding: 28, color: theme.textMuted, fontSize: 13 }}>
            No audit events yet. Start/stop a timer, create a project, or change an approval to write a row.
          </div>
        )}
      </div>
    </div>
  );
}
