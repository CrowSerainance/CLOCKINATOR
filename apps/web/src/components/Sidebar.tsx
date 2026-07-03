import type { Screen } from "../types";
import { theme } from "../theme";

interface NavItem {
  id: Screen;
  label: string;
  group: string;
}

const NAV: NavItem[] = [
  { id: "tracker", label: "Time Tracker", group: "TRACK" },
  { id: "timesheet", label: "Timesheet", group: "TRACK" },
  { id: "reports", label: "Reports", group: "ANALYZE" },
  { id: "projects", label: "Projects", group: "MANAGE" },
  { id: "approvals", label: "Approvals", group: "REVIEW" },
  { id: "audit", label: "Audit Log", group: "REVIEW" },
];

export function Sidebar({
  screen,
  onSelect,
}: {
  screen: Screen;
  onSelect: (s: Screen) => void;
}) {
  let lastGroup = "";
  return (
    <aside
      style={{
        width: 250,
        flexShrink: 0,
        background: theme.surface,
        borderRight: `1px solid ${theme.border}`,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "20px 20px 18px" }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            background: theme.accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={theme.accentInk} strokeWidth="2.2" strokeLinecap="round">
            <circle cx="12" cy="12" r="8.2" />
            <path d="M12 7.6v4.6l3.1 2" />
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-.02em", lineHeight: 1 }}>Clockinator</div>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: theme.textFaint, letterSpacing: ".14em", marginTop: 3 }}>
            TIME OPS
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "4px 12px 12px" }}>
        {NAV.map((item) => {
          const showGroup = item.group !== lastGroup;
          lastGroup = item.group;
          const on = screen === item.id;
          return (
            <div key={item.id}>
              {showGroup && (
                <div style={{ fontSize: 10.5, fontWeight: 700, color: theme.textFaint, letterSpacing: ".13em", padding: "16px 6px 7px" }}>
                  {item.group}
                </div>
              )}
              <div
                onClick={() => onSelect(item.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "9px 13px",
                  borderRadius: 10,
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 600,
                  marginBottom: 2,
                  background: on ? theme.accent + "20" : "transparent",
                  color: on ? theme.text : theme.textMuted,
                }}
              >
                {item.label}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ padding: "14px 18px", borderTop: `1px solid ${theme.border}`, display: "flex", alignItems: "center", gap: 11 }}>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: theme.accent,
            color: theme.accentInk,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          MC
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Maya Chen</div>
          <div style={{ fontSize: 11, color: theme.textFaint }}>Owner</div>
        </div>
      </div>
    </aside>
  );
}
