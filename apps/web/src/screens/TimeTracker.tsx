import { useState, type CSSProperties } from "react";
import { theme } from "../theme";
import { useTimer } from "../hooks/useTimer";
import { useStore } from "../hooks/useClockinator";
import { useDurationFormat } from "../hooks/useDurationFormat";
import { formatDisplayDuration } from "../domain/preferences";
import { btn, fieldStyle } from "../components/ui";
import { Modal } from "../components/Modal";
import { EntryEditor } from "../components/EntryEditor";
import type { TagOption, TimeEntry } from "../types";

export function TimeTracker() {
  const timer = useTimer();
  const [durationFormat, setDurationFormat] = useDurationFormat();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const [adding, setAdding] = useState(false);
  const q = query.trim().toLowerCase();
  const groups = q
    ? timer.groups
        .map((group) => ({
          ...group,
          entries: group.entries.filter(
            (entry) =>
              entry.desc.toLowerCase().includes(q) ||
              entry.project.toLowerCase().includes(q) ||
              entry.client.toLowerCase().includes(q) ||
              entry.tags.some((tag) => tag.toLowerCase().includes(q)),
          ),
        }))
        .filter((group) => group.entries.length > 0)
    : timer.groups;

  return (
    <div style={{ padding: "18px 28px 32px", overflowY: "auto", flex: 1 }}>
      {timer.isIdle ? <Composer timer={timer} /> : <SessionBar timer={timer} />}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>This week</div>
        <div style={{ fontSize: 13, color: theme.textMuted }}>
          Week total{" "}
          <span className="mono" style={{ color: theme.text, fontWeight: 600 }}>
            {formatDisplayDuration(timer.weekTotalSeconds, durationFormat)}
          </span>
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setDurationFormat(durationFormat === "clock" ? "decimal" : "clock")}
          title="Toggle decimal hours"
          style={btn(theme.surfaceAlt, theme.textMuted, { fontSize: 12 })}
        >
          {durationFormat === "clock" ? "h:mm:ss" : "0.00h"}
        </button>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find by description, project, tag…"
          style={{ ...fieldStyle, width: 280 }}
        />
        <button onClick={() => setAdding(true)} style={btn(theme.surfaceAlt, theme.text)}>
          + Add time
        </button>
      </div>

      {groups.length === 0 && (
        <div style={{ color: theme.textMuted, fontSize: 14, padding: "20px 4px" }}>
          {q ? "No matching entries." : "No time entries in the last two weeks."}
        </div>
      )}

      {groups.map((group) => {
        const groupSeconds = group.entries
          .filter((e) => e.kind !== "break")
          .reduce((sum, e) => sum + (e.durationSeconds ?? 0), 0);
        return (
          <div
            key={group.dayKey ?? group.label}
            style={{
              background: theme.surface,
              border: `1px solid ${theme.border}`,
              borderRadius: 12,
              marginBottom: 10,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "9px 16px",
                fontSize: 12,
                background: theme.surfaceAlt,
                borderBottom: `1px solid ${theme.border}`,
              }}
            >
              <span style={{ fontWeight: 700, color: theme.textMuted, letterSpacing: ".02em" }}>{group.label.toUpperCase()}</span>
              <span style={{ color: theme.textMuted }}>
                Total{" "}
                <span className="mono" style={{ color: theme.text, fontWeight: 600 }}>
                  {formatDisplayDuration(groupSeconds, durationFormat)}
                </span>
              </span>
            </div>
            {group.entries.map((entry) => (
              <EntryRow
                key={entry.id ?? `${entry.desc}-${entry.start}`}
                entry={entry}
                durationFormat={durationFormat}
                canRestart={timer.isIdle && Boolean(entry.id) && entry.kind !== "break"}
                onRestart={() => {
                  if (entry.id) timer.restartFrom(entry.id);
                }}
                onEdit={() => setEditing(entry)}
              />
            ))}
          </div>
        );
      })}
      {(editing || adding) && (
        <Modal title={editing ? "Edit entry" : "Add time"} onClose={() => { setEditing(null); setAdding(false); }}>
          <EntryEditor
            entry={editing ?? undefined}
            onClose={() => {
              setEditing(null);
              setAdding(false);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function Composer({ timer }: { timer: ReturnType<typeof useTimer> }) {
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("");
  const [billable, setBillable] = useState(true);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [mode, setMode] = useState<"timer" | "manual">("timer");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [error, setError] = useState("");

  const store = useStore();
  const tasks = projectId ? store.listTasks(projectId) : [];
  const [taskId, setTaskId] = useState("");
  const selected = timer.projects.find((p) => p.id === projectId);

  const start = () => {
    timer.start({
      description: description.trim() || "No description",
      projectId: projectId || null,
      taskId: taskId || null,
      isBillable: selected ? selected.isBillable && billable : billable,
      tagIds,
    });
    setDescription("");
    setTagIds([]);
    setTaskId("");
  };

  const addManual = () => {
    try {
      setError("");
      const [sh, sm] = startTime.split(":").map(Number);
      const [eh, em] = endTime.split(":").map(Number);
      const startAt = new Date();
      startAt.setHours(sh, sm, 0, 0);
      const endAt = new Date();
      endAt.setHours(eh, em, 0, 0);
      timer.addManual({
        description: description.trim() || "No description",
        projectId: projectId || null,
        taskId: taskId || null,
        tagIds,
        isBillable: selected ? selected.isBillable && billable : billable,
        start: startAt,
        end: endAt,
      });
      setDescription("");
      setTagIds([]);
      setTaskId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div style={{ marginBottom: 18 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: 12,
          padding: "10px 12px",
        }}
      >
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (mode === "timer" ? start : addManual)();
          }}
          placeholder="What are you working on?"
          style={{
            flex: 1,
            minWidth: 0,
            background: "transparent",
            border: "none",
            outline: "none",
            color: theme.text,
            fontSize: 15,
            fontWeight: 600,
          }}
        />
        <select
          value={projectId}
          onChange={(e) => {
            const id = e.target.value;
            setProjectId(id);
            setTaskId("");
            const project = timer.projects.find((p) => p.id === id);
            if (project) setBillable(project.isBillable);
          }}
          style={{ ...fieldStyle, maxWidth: 200 }}
        >
          <option value="">+ Project</option>
          {timer.projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        {projectId && (
          <select value={taskId} onChange={(e) => setTaskId(e.target.value)} style={{ ...fieldStyle, maxWidth: 160 }}>
            <option value="">Task</option>
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.name}
              </option>
            ))}
          </select>
        )}
        <TagPicker tags={timer.tags} selected={tagIds} onChange={setTagIds} />
        <button
          onClick={() => setBillable((v) => !v)}
          title={billable ? "Billable" : "Non-billable"}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: billable ? theme.accent : theme.textFaint,
            fontWeight: 700,
            fontSize: 16,
            width: 28,
          }}
        >
          $
        </button>
        {mode === "manual" ? (
          <>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={fieldStyle} />
            <span style={{ color: theme.textFaint, fontSize: 12 }}>—</span>
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={fieldStyle} />
            <button onClick={addManual} style={btn(theme.accent, theme.accentInk)}>
              ADD
            </button>
          </>
        ) : (
          <>
            <span className="mono" style={{ fontSize: 20, fontWeight: 600, width: 92, textAlign: "right" }}>
              0:00:00
            </span>
            <button onClick={start} style={btn(theme.accent, theme.accentInk)}>
              START
            </button>
          </>
        )}
        <ModeToggle mode={mode} onChange={setMode} />
      </div>
      {error && <div style={{ color: theme.danger, fontSize: 12, marginTop: 8 }}>{error}</div>}
    </div>
  );
}

function ModeToggle({ mode, onChange }: { mode: "timer" | "manual"; onChange: (m: "timer" | "manual") => void }) {
  const item = (id: "timer" | "manual"): CSSProperties => ({
    background: mode === id ? theme.surfaceAlt : "transparent",
    color: mode === id ? theme.text : theme.textFaint,
    border: `1px solid ${theme.border}`,
    borderRadius: 8,
    padding: "6px 8px",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
  });
  return (
    <div style={{ display: "flex", gap: 4 }}>
      <button title="Timer" onClick={() => onChange("timer")} style={item("timer")}>
        ⏱
      </button>
      <button title="Manual" onClick={() => onChange("manual")} style={item("manual")}>
        ☰
      </button>
    </div>
  );
}

function TagPicker({
  tags,
  selected,
  onChange,
}: {
  tags: TagOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Tags"
        style={{
          ...fieldStyle,
          cursor: "pointer",
          color: selected.length ? theme.text : theme.textMuted,
          minWidth: 88,
        }}
      >
        {selected.length ? `${selected.length} tag${selected.length === 1 ? "" : "s"}` : "Tags"}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "110%",
            zIndex: 20,
            width: 220,
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            borderRadius: 10,
            padding: 8,
            boxShadow: "0 12px 32px rgba(0,0,0,.35)",
          }}
        >
          {tags.map((tag) => {
            const on = selected.includes(tag.id);
            return (
              <label
                key={tag.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 8px",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 13,
                  background: on ? theme.accent + "18" : "transparent",
                }}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => onChange(on ? selected.filter((id) => id !== tag.id) : [...selected, tag.id])}
                />
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: tag.color }} />
                {tag.name}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SessionBar({ timer }: { timer: ReturnType<typeof useTimer> }) {
  const session = timer.session;
  if (!session) return null;

  const statusLabel = timer.isPaused ? "Paused" : timer.isOnBreak ? "On break" : "Tracking";
  const displayTime = timer.isOnBreak ? timer.breakLabel : timer.elapsedLabel;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: 12,
        padding: "14px 16px",
        marginBottom: 18,
      }}
    >
      <span
        style={{
          width: 9,
          height: 9,
          borderRadius: "50%",
          background: timer.isRunning ? theme.accent : timer.isOnBreak ? theme.danger : theme.textFaint,
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{session.description || "No description"}</div>
        <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>
          {statusLabel}
          {session.projectName ? ` · ${session.projectName}` : ""}
          {session.clientName ? ` · ${session.clientName}` : ""}
        </div>
      </div>
      <span className="mono" style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-.01em" }}>
        {displayTime}
      </span>
      {timer.isRunning && (
        <>
          <button onClick={() => timer.pause()} style={btn(theme.surfaceAlt, theme.text)}>
            Pause
          </button>
          <button onClick={() => timer.split()} style={btn(theme.surfaceAlt, theme.text)}>
            Split
          </button>
          <button onClick={() => timer.beginBreak()} style={btn(theme.surfaceAlt, theme.text)}>
            Break
          </button>
        </>
      )}
      {timer.isPaused && (
        <button onClick={() => timer.resume()} style={btn(theme.accent, theme.accentInk)}>
          Resume
        </button>
      )}
      {timer.isOnBreak && (
        <button onClick={() => timer.finishBreak()} style={btn(theme.accent, theme.accentInk)}>
          End break
        </button>
      )}
      <button onClick={() => timer.stop()} style={btn(theme.danger, "#1c1a18")}>
        Stop
      </button>
    </div>
  );
}

function EntryRow({
  entry,
  canRestart,
  onRestart,
  onEdit,
  durationFormat,
}: {
  entry: TimeEntry;
  canRestart: boolean;
  onRestart: () => void;
  onEdit: () => void;
  durationFormat: "clock" | "decimal";
}) {
  const isBreak = entry.kind === "break";
  const tags = entry.tags.length ? entry.tags : entry.tag ? [entry.tag] : [];
  return (
    <div
      onClick={onEdit}
      title={isBreak ? "Edit break" : "Edit entry"}
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(160px,1.6fr) minmax(160px,1.3fr) minmax(90px,0.8fr) 22px 110px 72px 36px",
        alignItems: "center",
        gap: 10,
        padding: "9px 16px",
        borderTop: `1px solid ${theme.border}`,
        cursor: "pointer",
        opacity: isBreak ? 0.85 : 1,
        background: isBreak ? "rgba(224,133,133,0.06)" : undefined,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: isBreak ? theme.textMuted : theme.text }}>
        {isBreak ? "Break" : entry.desc}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: entry.color, flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: theme.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {isBreak ? "—" : entry.project}
        </span>
        {!isBreak && (
          <span style={{ fontSize: 12, color: theme.textFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {entry.client ? `· ${entry.client}` : ""}
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {isBreak ? (
          <span style={{ fontSize: 10, fontWeight: 600, color: theme.danger, background: theme.surfaceAlt, borderRadius: 6, padding: "2px 6px" }}>
            break
          </span>
        ) : (
          tags.map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: theme.textMuted,
                background: theme.surfaceAlt,
                borderRadius: 6,
                padding: "2px 6px",
              }}
            >
              {tag}
            </span>
          ))
        )}
      </div>
      <span style={{ textAlign: "center", color: entry.billable ? theme.accent : theme.textFaint, fontWeight: 700 }}>
        {isBreak ? "—" : "$"}
      </span>
      <span className="mono" style={{ fontSize: 12, color: theme.textMuted }}>
        {entry.start} – {entry.end}
      </span>
      <span className="mono" style={{ fontSize: 13, fontWeight: 600, textAlign: "right" }}>
        {formatDisplayDuration(entry.durationSeconds ?? 0, durationFormat)}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRestart();
        }}
        disabled={!canRestart}
        title="Continue this entry"
        style={{
          background: "none",
          border: "none",
          cursor: canRestart ? "pointer" : "default",
          color: canRestart ? theme.textMuted : theme.border,
          fontSize: 13,
          padding: 4,
        }}
      >
        ▶
      </button>
    </div>
  );
}
