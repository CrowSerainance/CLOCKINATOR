import { useState } from "react";
import { theme } from "../theme";
import { useStore, useStoreRevision } from "../hooks/useClockinator";
import { addDays, formatDuration, startOfLocalWeek } from "../domain/duration";
import { btn, card, pagePad } from "../components/ui";
import { Modal } from "../components/Modal";
import { EntryEditor } from "../components/EntryEditor";

export function Timesheet() {
  const store = useStore();
  useStoreRevision();
  const [offset, setOffset] = useState(0);
  const [draft, setDraft] = useState<{ date: string; start: string; end: string; projectId?: string | null } | null>(null);
  const weekStart = addDays(startOfLocalWeek(new Date()), offset * 7);
  const grid = store.timesheetWeek(weekStart);
  const COLS = `minmax(180px,1.4fr) repeat(7, 1fr) 90px`;

  return (
    <div style={pagePad}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>Timesheet</div>
        <div style={{ fontSize: 13, color: theme.textMuted }}>
          {weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} –{" "}
          {addDays(weekStart, 6).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </div>
        <button onClick={() => setOffset((n) => n - 1)} style={btn(theme.surfaceAlt, theme.text)}>
          ←
        </button>
        <button onClick={() => setOffset(0)} style={btn(theme.surfaceAlt, theme.text)}>
          This week
        </button>
        <button onClick={() => setOffset((n) => n + 1)} style={btn(theme.surfaceAlt, theme.text)}>
          →
        </button>
        <div style={{ flex: 1 }} />
        <div className="mono" style={{ fontSize: 18, fontWeight: 700 }}>
          {formatDuration(grid.weekTotal)}
        </div>
        <button
          onClick={() => {
            const n = store.submitWeek(weekStart);
            window.alert(n ? `Submitted ${n} draft entries.` : "No draft entries this week.");
          }}
          style={btn(theme.accent, theme.accentInk)}
        >
          Submit week
        </button>
      </div>

      <div style={card}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: COLS,
            gap: 8,
            padding: "12px 16px",
            fontSize: 11,
            fontWeight: 700,
            color: theme.textFaint,
            letterSpacing: ".06em",
            background: theme.surfaceAlt,
          }}
        >
          <span>PROJECT</span>
          {grid.days.map((day) => (
            <span key={day.key} style={{ textAlign: "center" }}>
              {day.label.toUpperCase()}
            </span>
          ))}
          <span style={{ textAlign: "right" }}>TOTAL</span>
        </div>
        {grid.rows.map((row) => (
          <div
            key={row.projectId ?? row.project}
            style={{
              display: "grid",
              gridTemplateColumns: COLS,
              gap: 8,
              padding: "12px 16px",
              borderTop: `1px solid ${theme.border}`,
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: row.color, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {row.project}
              </span>
            </div>
            {row.cells.map((cell, i) => (
              <button
                key={grid.days[i].key}
                onClick={() => {
                  if (!cell.seconds) {
                    setDraft({ date: grid.days[i].key, start: "09:00", end: "10:00", projectId: row.projectId });
                  }
                }}
                className="mono"
                style={{
                  fontSize: 12,
                  textAlign: "center",
                  color: cell.seconds ? theme.text : theme.textFaint,
                  background: "none",
                  border: "none",
                  cursor: cell.seconds ? "default" : "pointer",
                }}
              >
                {cell.label}
              </button>
            ))}
            <span className="mono" style={{ fontSize: 13, fontWeight: 600, textAlign: "right" }}>
              {formatDuration(row.totalSeconds)}
            </span>
          </div>
        ))}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: COLS,
            gap: 8,
            padding: "12px 16px",
            borderTop: `1px solid ${theme.border}`,
            background: theme.surfaceAlt,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted }}>Day total</span>
          {grid.days.map((day) => (
            <span key={day.key} className="mono" style={{ fontSize: 12, textAlign: "center", fontWeight: 600 }}>
              {day.totalSeconds ? formatDuration(day.totalSeconds) : "—"}
            </span>
          ))}
          <span className="mono" style={{ fontSize: 13, fontWeight: 700, textAlign: "right" }}>
            {formatDuration(grid.weekTotal)}
          </span>
        </div>
        {grid.rows.length === 0 && (
          <div style={{ padding: "28px 18px", color: theme.textMuted, fontSize: 13 }}>No completed work this week. Click + in Calendar or Tracker to add time.</div>
        )}
      </div>
      {draft && (
        <Modal title="Add time" onClose={() => setDraft(null)}>
          <EntryEditor preset={draft} onClose={() => setDraft(null)} />
        </Modal>
      )}
    </div>
  );
}
