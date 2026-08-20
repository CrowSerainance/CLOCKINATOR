import type { Screen } from "../types";
import { theme } from "../theme";
import type { ReactNode } from "react";

function strokeIcon(d: string) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const clockIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v4l3 2" />
  </svg>
);
const gridIcon = strokeIcon("M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z");
const chartIcon = strokeIcon("M4 19V9M10 19V5M16 19v-8M20 19H3");
const folderIcon = strokeIcon("M3 7h6l2 2h10v10H3z");
const usersIcon = strokeIcon("M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z");
const tagIcon = strokeIcon("M20.6 13.4 12 22l-9-9 8.6-8.6a2 2 0 0 1 1.4-.4H19a2 2 0 0 1 2 2v6.4a2 2 0 0 1-.4 1.4z");
const calIcon = strokeIcon("M4 7h16M7 3v4M17 3v4M5 11h14v10H5z");
const checkIcon = strokeIcon("M9 11l3 3 8-8M5 19h14");
const listIcon = strokeIcon("M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01");

interface NavItem {
  id: Screen;
  label: string;
  group: string;
  icon: ReactNode;
}

const NAV: NavItem[] = [
  { id: "tracker", label: "Time Tracker", group: "TRACK", icon: clockIcon },
  { id: "timesheet", label: "Timesheet", group: "TRACK", icon: gridIcon },
  { id: "calendar", label: "Calendar", group: "TRACK", icon: calIcon },
  { id: "reports", label: "Reports", group: "ANALYZE", icon: chartIcon },
  { id: "projects", label: "Projects", group: "MANAGE", icon: folderIcon },
  { id: "clients", label: "Clients", group: "MANAGE", icon: usersIcon },
  { id: "tags", label: "Tags", group: "MANAGE", icon: tagIcon },
  { id: "approvals", label: "Approvals", group: "REVIEW", icon: checkIcon },
  { id: "audit", label: "Audit Log", group: "REVIEW", icon: listIcon },
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
                  padding: "8px 13px",
                  borderRadius: 10,
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 600,
                  marginBottom: 2,
                  background: on ? theme.accent + "20" : "transparent",
                  color: on ? theme.text : theme.textMuted,
                }}
              >
                <span style={{ width: 18, height: 18, display: "flex", color: on ? theme.accent : theme.textFaint }}>{item.icon}</span>
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
