import { theme } from "../theme";
import { useStore, useStoreRevision } from "../hooks/useClockinator";
import { card, pagePad } from "../components/ui";

export function AuditLog() {
  const store = useStore();
  useStoreRevision();
  const rows = store.listAudit();

  return (
    <div style={pagePad}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>Audit Log</div>
        <div style={{ fontSize: 13, color: theme.textMuted }}>{rows.length} recent events</div>
      </div>
      <div style={card}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "140px 1.2fr 0.8fr 1fr 1fr",
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
          <span>ID</span>
        </div>
        {rows.map((row) => (
          <div
            key={row.id}
            style={{
              display: "grid",
              gridTemplateColumns: "140px 1.2fr 0.8fr 1fr 1fr",
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
            <span className="mono" style={{ fontSize: 11, color: theme.textFaint, overflow: "hidden", textOverflow: "ellipsis" }}>{row.targetId}</span>
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
