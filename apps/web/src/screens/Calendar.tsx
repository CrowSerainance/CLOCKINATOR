import { useState } from "react";
import { theme } from "../theme";
import { useStore, useStoreRevision } from "../hooks/useClockinator";
import { addDays, formatDuration, startOfLocalWeek, toDateInput } from "../domain/duration";
import { btn, pagePad } from "../components/ui";
import { Modal } from "../components/Modal";
import { EntryEditor } from "../components/EntryEditor";

const HOUR_START = 7;
const HOUR_END = 20;
const ROW_H = 48;
const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);

export function Calendar() {
  const store = useStore();
  useStoreRevision();
  const [offset, setOffset] = useState(0);
  const weekStart = addDays(startOfLocalWeek(new Date()), offset * 7);
  const grid = store.calendarWeek(weekStart);
  const [draft, setDraft] = useState<{ date: string; start: string; end: string } | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const trackerEntry = editId ? store.getEntry(editId) : undefined;

  return (
    <div style={{ ...pagePad, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexShrink: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>Calendar</div>
        <div style={{ fontSize: 13, color: theme.textMuted }}>Week</div>
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
        <button onClick={() => setDraft({ date: toDateInput(new Date()), start: "09:00", end: "10:00" })} style={btn(theme.accent, theme.accentInk)}>
          + Add entry
        </button>
      </div>

      <div style={{ flex: 1, overflow: "auto", border: `1px solid ${theme.border}`, borderRadius: 14, background: theme.surface }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "64px repeat(7, minmax(120px, 1fr))",
            position: "sticky",
            top: 0,
            zIndex: 2,
            background: theme.surfaceAlt,
            borderBottom: `1px solid ${theme.border}`,
          }}
        >
          <div />
          {grid.days.map((day) => (
            <div key={day.key} style={{ padding: "10px 8px", textAlign: "center", borderLeft: `1px solid ${theme.border}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: theme.textFaint, letterSpacing: ".06em" }}>{day.weekday.toUpperCase()}</div>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{day.dateLabel}</div>
              <div className="mono" style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
                {day.totalSeconds ? formatDuration(day.totalSeconds) : "—"}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "64px repeat(7, minmax(120px, 1fr))" }}>
          <div>
            {hours.map((h) => (
              <div key={h} className="mono" style={{ height: ROW_H, fontSize: 11, color: theme.textFaint, padding: "0 8px", borderBottom: `1px solid ${theme.border}` }}>
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>
          {grid.days.map((day) => (
            <div
              key={day.key}
              style={{ position: "relative", borderLeft: `1px solid ${theme.border}`, height: hours.length * ROW_H }}
              onDoubleClick={(e) => {
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                const y = e.clientY - rect.top;
                const hour = Math.min(HOUR_END - 1, HOUR_START + Math.floor(y / ROW_H));
                setDraft({
                  date: day.key,
                  start: `${String(hour).padStart(2, "0")}:00`,
                  end: `${String(Math.min(hour + 1, 23)).padStart(2, "0")}:00`,
                });
              }}
            >
              {hours.map((h) => (
                <div key={h} style={{ height: ROW_H, borderBottom: `1px solid ${theme.border}` }} />
              ))}
              {day.entries.map((block) => {
                const top = ((block.startMin - HOUR_START * 60) / 60) * ROW_H;
                const height = Math.max(28, ((block.endMin - block.startMin) / 60) * ROW_H);
                return (
                  <button
                    key={block.id}
                    onClick={() => setEditId(block.id)}
                    style={{
                      position: "absolute",
                      left: 4,
                      right: 4,
                      top: Math.max(0, top),
                      height,
                      overflow: "hidden",
                      textAlign: "left",
                      background: theme.surfaceAlt,
                      border: `1px solid ${theme.border}`,
                      borderLeft: `3px solid ${block.color}`,
                      borderRadius: 8,
                      padding: "6px 8px",
                      cursor: "pointer",
                      color: theme.text,
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{block.desc}</div>
                    <div style={{ fontSize: 11, color: theme.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{block.project}</div>
                    <div className="mono" style={{ fontSize: 10, color: theme.textFaint, marginTop: 2 }}>
                      {block.dur}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 12, color: theme.textFaint, marginTop: 8, flexShrink: 0 }}>Double-click an empty hour to add time.</div>

      {(draft || trackerEntry) && (
        <Modal
          title={trackerEntry ? "Edit entry" : "Add entry"}
          onClose={() => {
            setDraft(null);
            setEditId(null);
          }}
        >
          <EntryEditor
            entry={trackerEntry}
            preset={draft ?? undefined}
            onClose={() => {
              setDraft(null);
              setEditId(null);
            }}
          />
        </Modal>
      )}
    </div>
  );
}
