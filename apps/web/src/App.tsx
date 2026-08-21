import { useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { TimeTracker } from "./screens/TimeTracker";
import { Timesheet } from "./screens/Timesheet";
import { Calendar } from "./screens/Calendar";
import { Projects } from "./screens/Projects";
import { Clients } from "./screens/Clients";
import { Tags } from "./screens/Tags";
import { Reports } from "./screens/Reports";
import { Approvals } from "./screens/Approvals";
import { AuditLog } from "./screens/AuditLog";
import { Invoices } from "./screens/Invoices";
import type { Screen } from "./types";
import { theme } from "./theme";
import { useStore } from "./hooks/useClockinator";

const TITLES: Record<Screen, string> = {
  tracker: "Time Tracker",
  timesheet: "Timesheet",
  calendar: "Calendar",
  reports: "Reports",
  projects: "Projects",
  clients: "Clients",
  tags: "Tags",
  invoices: "Invoices",
  approvals: "Approvals",
  audit: "Audit Log",
};

export function App() {
  const [screen, setScreen] = useState<Screen>("tracker");
  const store = useStore();

  return (
    <div style={{ display: "flex", height: "100vh", width: "100%", overflow: "hidden" }}>
      <Sidebar screen={screen} onSelect={setScreen} />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "0 28px",
            height: 56,
            borderBottom: `1px solid ${theme.border}`,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 700 }}>{store.workspaceName}</span>
          <span style={{ fontSize: 13, color: theme.textFaint }}>/ {TITLES[screen]}</span>
          <span style={{ fontSize: 12, color: theme.textFaint, marginLeft: 8 }}>{store.userName}</span>
        </header>
        {screen === "tracker" ? (
          <TimeTracker />
        ) : screen === "timesheet" ? (
          <Timesheet />
        ) : screen === "calendar" ? (
          <Calendar />
        ) : screen === "projects" ? (
          <Projects />
        ) : screen === "clients" ? (
          <Clients />
        ) : screen === "tags" ? (
          <Tags />
        ) : screen === "reports" ? (
          <Reports />
        ) : screen === "invoices" ? (
          <Invoices />
        ) : screen === "approvals" ? (
          <Approvals />
        ) : (
          <AuditLog />
        )}
      </main>
    </div>
  );
}
