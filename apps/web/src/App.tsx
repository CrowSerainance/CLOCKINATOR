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
import { Expenses } from "./screens/Expenses";
import { TimeOff } from "./screens/TimeOff";
import { Schedule } from "./screens/Schedule";
import { Team } from "./screens/Team";
import { WorkspaceSettings } from "./screens/WorkspaceSettings";
import type { Screen } from "./types";
import { theme } from "./theme";
import { useStore, useStoreRevision } from "./hooks/useClockinator";

const TITLES: Record<Screen, string> = {
  tracker: "Time Tracker",
  timesheet: "Timesheet",
  calendar: "Calendar",
  schedule: "Schedule",
  reports: "Reports",
  projects: "Projects",
  clients: "Clients",
  tags: "Tags",
  invoices: "Invoices",
  expenses: "Expenses",
  timeoff: "Time off",
  approvals: "Approvals",
  audit: "Audit Log",
  team: "Team",
  workspace: "Workspace",
};

export function App() {
  const [screen, setScreen] = useState<Screen>("tracker");
  const store = useStore();
  useStoreRevision();
  const hidden = store.hiddenPageIds();
  const visible = hidden.includes(screen) ? "tracker" : screen;
  const alerts = store.listAlerts();
  const users = store.listUsers();

  return (
    <div style={{ display: "flex", height: "100vh", width: "100%", overflow: "hidden" }}>
      <Sidebar
        screen={visible}
        onSelect={setScreen}
        hidden={hidden}
        userName={store.userName}
        role={store.currentRole()}
      />
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
          <span style={{ fontSize: 13, color: theme.textFaint }}>/ {TITLES[visible]}</span>
          <span style={{ flex: 1 }} />
          <label style={{ fontSize: 12, color: theme.textFaint, display: "flex", alignItems: "center", gap: 6 }}>
            Acting as
            <select
              value={store.userId}
              onChange={(e) => store.switchUser(e.target.value)}
              style={{
                background: theme.surfaceAlt,
                color: theme.text,
                border: `1px solid ${theme.border}`,
                borderRadius: 8,
                padding: "4px 8px",
                fontSize: 12,
              }}
            >
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} · {user.role}
                </option>
              ))}
            </select>
          </label>
        </header>
        {alerts.length > 0 && (
          <div style={{ padding: "8px 28px", borderBottom: `1px solid ${theme.border}`, fontSize: 12, color: theme.textMuted, display: "flex", gap: 14, flexWrap: "wrap" }}>
            {alerts.map((alert) => (
              <span key={alert}>{alert}</span>
            ))}
          </div>
        )}
        {visible === "tracker" ? (
          <TimeTracker />
        ) : visible === "timesheet" ? (
          <Timesheet />
        ) : visible === "calendar" ? (
          <Calendar />
        ) : visible === "schedule" ? (
          <Schedule />
        ) : visible === "projects" ? (
          <Projects />
        ) : visible === "clients" ? (
          <Clients />
        ) : visible === "tags" ? (
          <Tags />
        ) : visible === "reports" ? (
          <Reports />
        ) : visible === "invoices" ? (
          <Invoices />
        ) : visible === "expenses" ? (
          <Expenses />
        ) : visible === "timeoff" ? (
          <TimeOff />
        ) : visible === "approvals" ? (
          <Approvals />
        ) : visible === "team" ? (
          <Team />
        ) : visible === "workspace" ? (
          <WorkspaceSettings />
        ) : (
          <AuditLog />
        )}
      </main>
    </div>
  );
}
