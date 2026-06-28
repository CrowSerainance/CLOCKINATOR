import { useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { TimeTracker } from "./screens/TimeTracker";
import { Placeholder } from "./screens/Placeholder";
import type { Screen } from "./types";
import { theme } from "./theme";

const TITLES: Record<Screen, string> = {
  tracker: "Time Tracker",
  timesheet: "Timesheet",
  reports: "Reports",
  projects: "Projects",
  approvals: "Approvals",
  audit: "Audit Log",
};

export function App() {
  const [screen, setScreen] = useState<Screen>("tracker");

  return (
    <div style={{ display: "flex", height: "100vh", width: "100%", overflow: "hidden" }}>
      <Sidebar screen={screen} onSelect={setScreen} />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "0 30px",
            height: 60,
            borderBottom: `1px solid ${theme.border}`,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 700 }}>Northwind Studio</span>
          <span style={{ fontSize: 13, color: theme.textFaint }}>/ {TITLES[screen]}</span>
        </header>
        {screen === "tracker" ? <TimeTracker /> : <Placeholder title={TITLES[screen]} />}
      </main>
    </div>
  );
}
