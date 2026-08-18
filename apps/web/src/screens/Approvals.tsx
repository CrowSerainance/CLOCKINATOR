import { theme } from "../theme";
import { useStore, useStoreRevision } from "../hooks/useClockinator";
import { btn, card, pagePad } from "../components/ui";

export function Approvals() {
  const store = useStore();
  useStoreRevision();
  const rows = store.listApprovals();
  const pending = rows.filter((r) => r.status === "submitted").length;
  const drafts = rows.filter((r) => r.status === "draft").length;

  return (
    <div style={pagePad}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>Approvals</div>
        <div style={{ fontSize: 13, color: theme.textMuted }}>
          {pending} submitted · {drafts} draft
        </div>
      </div>
      <div style={card}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(180px,1.6fr) 1.1fr 0.8fr 0.7fr 0.8fr 160px",
            gap: 12,
            padding: "12px 18px",
            fontSize: 11,
            fontWeight: 700,
            color: theme.textFaint,
            letterSpacing: ".06em",
            background: theme.surfaceAlt,
          }}
        >
          <span>ENTRY</span>
          <span>PROJECT</span>
          <span>DAY</span>
          <span>DURATION</span>
          <span>STATUS</span>
          <span />
        </div>
        {rows.map((row) => (
          <div
            key={row.id}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(180px,1.6fr) 1.1fr 0.8fr 0.7fr 0.8fr 160px",
              gap: 12,
              padding: "11px 18px",
              borderTop: `1px solid ${theme.border}`,
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.desc}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: row.color, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: theme.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.project}</span>
            </div>
            <span style={{ fontSize: 13, color: theme.textMuted }}>{row.day}</span>
            <span className="mono" style={{ fontSize: 13 }}>{row.dur}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: statusColor(row.status), textTransform: "capitalize" }}>{row.status}</span>
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              {row.status === "draft" && (
                <button onClick={() => store.setApprovalStatus(row.id, "submitted")} style={btn(theme.surfaceAlt, theme.text, { padding: "6px 10px", fontSize: 12 })}>
                  Submit
                </button>
              )}
              {row.status === "submitted" && (
                <>
                  <button onClick={() => store.setApprovalStatus(row.id, "approved")} style={btn(theme.accent, theme.accentInk, { padding: "6px 10px", fontSize: 12 })}>
                    Approve
                  </button>
                  <button onClick={() => store.setApprovalStatus(row.id, "rejected")} style={btn(theme.surfaceAlt, theme.danger, { padding: "6px 10px", fontSize: 12 })}>
                    Reject
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
        {rows.length === 0 && <div style={{ padding: 28, color: theme.textMuted, fontSize: 13 }}>No time entries to review.</div>}
      </div>
    </div>
  );
}

function statusColor(status: string): string {
  if (status === "approved") return theme.accent;
  if (status === "submitted") return "#e0b15c";
  if (status === "rejected") return theme.danger;
  return theme.textFaint;
}
