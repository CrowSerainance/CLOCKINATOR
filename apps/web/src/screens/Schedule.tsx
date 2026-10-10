import { useState } from "react";
import { theme } from "../theme";
import { useStore, useStoreRevision } from "../hooks/useClockinator";
import { addDays, startOfLocalWeek, toDateInput } from "../domain/duration";
import { btn, card, fieldStyle, pagePad } from "../components/ui";

export function Schedule() {
  const store = useStore();
  useStoreRevision();
  const [offset, setOffset] = useState(0);
  const weekStart = addDays(startOfLocalWeek(new Date()), offset * 7);
  const blocks = store.listSchedule(weekStart);
  const forecast = store.forecastWeek(weekStart);
  const users = store.listUsers();
  const projects = store.listActiveProjects();
  const [userId, setUserId] = useState(store.userId);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [day, setDay] = useState(toDateInput(weekStart));
  const [hours, setHours] = useState("8");
  const [error, setError] = useState("");
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

  return (
    <div style={pagePad}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>Schedule</div>
        <button onClick={() => setOffset((n) => n - 1)} style={btn(theme.surfaceAlt, theme.text)}>←</button>
        <button onClick={() => setOffset(0)} style={btn(theme.surfaceAlt, theme.text)}>This week</button>
        <button onClick={() => setOffset((n) => n + 1)} style={btn(theme.surfaceAlt, theme.text)}>→</button>
        <span style={{ fontSize: 13, color: theme.textMuted }}>
          {weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – {addDays(weekStart, 6).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 16 }}>
        {forecast.map((row) => (
          <div key={row.userId} style={{ ...card, padding: "12px 14px" }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{row.user}</div>
            <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>
              {row.scheduled.toFixed(1)}h scheduled / {row.capacity.toFixed(0)}h capacity
            </div>
            <div style={{ height: 6, borderRadius: 4, background: theme.surfaceAlt, marginTop: 8, overflow: "hidden" }}>
              <div style={{ width: `${Math.min(row.utilization * 100, 100)}%`, height: "100%", background: row.utilization > 1 ? theme.danger : theme.accent }} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <select value={userId} onChange={(e) => setUserId(e.target.value)} style={fieldStyle}>
          {users.map((user) => (
            <option key={user.id} value={user.id}>{user.name}</option>
          ))}
        </select>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={fieldStyle}>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
        </select>
        <select value={day} onChange={(e) => setDay(e.target.value)} style={fieldStyle}>
          {days.map((date) => {
            const key = toDateInput(date);
            return (
              <option key={key} value={key}>
                {date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
              </option>
            );
          })}
        </select>
        <input value={hours} onChange={(e) => setHours(e.target.value)} style={{ ...fieldStyle, width: 70 }} />
        <button
          onClick={() => {
            try {
              setError("");
              store.setScheduleBlock({ userId, projectId, day, hours, note: "" });
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            }
          }}
          style={btn(theme.accent, theme.accentInk)}
        >
          Assign
        </button>
      </div>
      {error && <div style={{ color: theme.danger, fontSize: 12, marginBottom: 8 }}>{error}</div>}

      <div style={card}>
        {blocks.map((block) => (
          <div key={block.id} style={{ display: "grid", gridTemplateColumns: "120px 1fr 1.2fr 70px 70px", gap: 10, padding: "10px 16px", borderTop: `1px solid ${theme.border}`, fontSize: 13, alignItems: "center" }}>
            <span className="mono">{block.day}</span>
            <span style={{ fontWeight: 600 }}>{block.user}</span>
            <span style={{ color: theme.textMuted }}>{block.project}</span>
            <span className="mono">{block.hours}h</span>
            <button
              onClick={() => store.setScheduleBlock({ userId: block.userId, projectId: block.projectId, day: block.day, hours: "0", note: "" })}
              style={btn(theme.surfaceAlt, theme.danger, { padding: "4px 8px" })}
            >
              Clear
            </button>
          </div>
        ))}
        {blocks.length === 0 && (
          <div style={{ padding: 24, color: theme.textMuted, fontSize: 13 }}>
            Nothing scheduled. Assign hours to compare the week against each person's capacity.
          </div>
        )}
      </div>
    </div>
  );
}
