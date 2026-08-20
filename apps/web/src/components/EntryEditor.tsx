import { useState } from "react";
import { theme, projectColors } from "../theme";
import { btn, fieldStyle } from "./ui";
import { labelStyle } from "./Modal";
import { useStore, useStoreRevision } from "../hooks/useClockinator";
import { fromDateAndTime, toDateInput, toTimeInput } from "../domain/duration";
import type { TimeEntry } from "../types";

export function EntryEditor({
  entry,
  preset,
  onClose,
}: {
  entry?: TimeEntry;
  preset?: { date: string; start: string; end: string; projectId?: string | null };
  onClose: () => void;
}) {
  const store = useStore();
  useStoreRevision();
  const start = entry?.startAt ? new Date(entry.startAt) : fromDateAndTime(preset?.date ?? toDateInput(new Date()), preset?.start ?? "09:00");
  const end = entry?.endAt ? new Date(entry.endAt) : fromDateAndTime(preset?.date ?? toDateInput(new Date()), preset?.end ?? "10:00");
  const [description, setDescription] = useState(entry?.desc ?? "");
  const [projectId, setProjectId] = useState(entry?.projectId ?? preset?.projectId ?? "");
  const [taskId, setTaskId] = useState(entry?.taskId ?? "");
  const [tagIds, setTagIds] = useState<string[]>(entry?.tagIds ?? []);
  const [billable, setBillable] = useState(entry?.billable ?? true);
  const [date, setDate] = useState(toDateInput(start));
  const [startTime, setStartTime] = useState(toTimeInput(start));
  const [endTime, setEndTime] = useState(toTimeInput(end));
  const [error, setError] = useState("");

  const projects = store.listActiveProjects();
  const tasks = store.listTasks(projectId || null);
  const tags = store.listTags();

  const save = () => {
    try {
      setError("");
      const payload = {
        description: description.trim() || "No description",
        projectId: projectId || null,
        taskId: taskId || null,
        tagIds,
        isBillable: billable,
        start: fromDateAndTime(date, startTime),
        end: fromDateAndTime(date, endTime),
      };
      if (entry?.id) store.updateEntry({ id: entry.id, ...payload });
      else store.createManualEntry(payload);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label>
        <span style={labelStyle}>DESCRIPTION</span>
        <input value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...fieldStyle, width: "100%" }} />
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label>
          <span style={labelStyle}>PROJECT</span>
          <select
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              setTaskId("");
            }}
            style={{ ...fieldStyle, width: "100%" }}
          >
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span style={labelStyle}>TASK</span>
          <select value={taskId} onChange={(e) => setTaskId(e.target.value)} style={{ ...fieldStyle, width: "100%" }} disabled={!projectId}>
            <option value="">No task</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div>
        <span style={labelStyle}>TAGS</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {tags.map((tag) => {
            const on = tagIds.includes(tag.id);
            return (
              <button
                key={tag.id}
                onClick={() => setTagIds(on ? tagIds.filter((id) => id !== tag.id) : [...tagIds, tag.id])}
                style={{
                  ...fieldStyle,
                  cursor: "pointer",
                  background: on ? theme.accent + "22" : theme.surfaceAlt,
                  borderColor: on ? theme.accent : theme.border,
                }}
              >
                {tag.name}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: 10 }}>
        <label>
          <span style={labelStyle}>DATE</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...fieldStyle, width: "100%" }} />
        </label>
        <label>
          <span style={labelStyle}>START</span>
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={{ ...fieldStyle, width: "100%" }} />
        </label>
        <label>
          <span style={labelStyle}>END</span>
          <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={{ ...fieldStyle, width: "100%" }} />
        </label>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
        <input type="checkbox" checked={billable} onChange={(e) => setBillable(e.target.checked)} />
        Billable
      </label>
      {error && <div style={{ color: theme.danger, fontSize: 12 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
        {entry?.id && (
          <button
            onClick={() => {
              if (entry.id && window.confirm("Delete this time entry?")) {
                store.deleteEntry(entry.id);
                onClose();
              }
            }}
            style={btn(theme.surfaceAlt, theme.danger)}
          >
            Delete
          </button>
        )}
        <button onClick={onClose} style={btn(theme.surfaceAlt, theme.text)}>
          Cancel
        </button>
        <button onClick={save} style={btn(theme.accent, theme.accentInk)}>
          Save
        </button>
      </div>
    </div>
  );
}

export function ColorDots({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {projectColors.map((color) => (
        <button
          key={color}
          onClick={() => onChange(color)}
          title={color}
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: color,
            border: value === color ? `2px solid ${theme.text}` : "2px solid transparent",
            cursor: "pointer",
          }}
        />
      ))}
    </div>
  );
}
