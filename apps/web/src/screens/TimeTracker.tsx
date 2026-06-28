import { useEffect, useState } from "react";
import { theme } from "../theme";
import { dayGroups, weekTotal } from "../data/sample";
import type { TimeEntry } from "../types";

function fmt(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${h}:${pad(m)}:${pad(s)}`;
}

function RunningBar() {
  const [elapsed, setElapsed] = useState(2537);
  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: 14,
        padding: "16px 18px",
        marginBottom: 22,
      }}
    >
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: theme.accent, flexShrink: 0 }} />
      <div style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>Design review prep</div>
      <span style={{ fontSize: 13, color: theme.textMuted }}>Brand Refresh · Acme Corp</span>
      <span className="mono" style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-.01em" }}>
        {fmt(elapsed)}
      </span>
      <button
        style={{
          background: theme.danger,
          color: "#1c1a18",
          border: "none",
          borderRadius: 10,
          padding: "10px 20px",
          fontWeight: 700,
          fontSize: 13,
          cursor: "pointer",
        }}
      >
        ■ STOP
      </button>
    </div>
  );
}

function EntryRow({ entry }: { entry: TimeEntry }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 18px",
        borderTop: `1px solid ${theme.border}`,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0 }}>{entry.desc}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, width: 220 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: entry.color, flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: theme.text }}>{entry.project}</span>
        <span style={{ fontSize: 13, color: theme.textFaint }}>· {entry.client}</span>
      </div>
      <div style={{ width: 90 }}>
        {entry.tag && (
          <span style={{ fontSize: 11, fontWeight: 600, color: theme.textMuted, background: theme.surfaceAlt, borderRadius: 6, padding: "3px 8px" }}>
            {entry.tag}
          </span>
        )}
      </div>
      <span style={{ width: 18, textAlign: "center", color: entry.billable ? theme.accent : theme.textFaint, fontWeight: 700 }}>$</span>
      <span className="mono" style={{ fontSize: 13, color: theme.textMuted, width: 120 }}>
        {entry.start} – {entry.end}
      </span>
      <span className="mono" style={{ fontSize: 14, fontWeight: 600, width: 80, textAlign: "right" }}>
        {entry.dur}
      </span>
    </div>
  );
}

export function TimeTracker() {
  return (
    <div style={{ padding: "26px 30px", overflowY: "auto", flex: 1 }}>
      <RunningBar />

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>This week</div>
        <div style={{ fontSize: 13, color: theme.textMuted }}>
          Week total <span className="mono" style={{ color: theme.text, fontWeight: 600 }}>{weekTotal}</span>
        </div>
      </div>

      {dayGroups.map((group) => (
        <div
          key={group.label}
          style={{
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            borderRadius: 14,
            marginBottom: 16,
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 18px", fontSize: 13 }}>
            <span style={{ fontWeight: 700, color: theme.textMuted }}>{group.label}</span>
            <span style={{ color: theme.textMuted }}>
              Total <span className="mono" style={{ color: theme.text, fontWeight: 600 }}>{group.total}</span>
            </span>
          </div>
          {group.entries.map((entry, i) => (
            <EntryRow key={i} entry={entry} />
          ))}
        </div>
      ))}
    </div>
  );
}
