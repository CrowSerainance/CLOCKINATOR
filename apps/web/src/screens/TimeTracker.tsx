import { useEffect, useState, type CSSProperties } from "react";
import { theme } from "../theme";
import { useTimer } from "../hooks/useTimer";
import { useStore, useStoreRevision } from "../hooks/useClockinator";
import { useDurationFormat } from "../hooks/useDurationFormat";
import { formatDisplayDuration } from "../domain/preferences";
import { btn, fieldStyle } from "../components/ui";
import { Modal } from "../components/Modal";
import { EntryEditor } from "../components/EntryEditor";
import type { TagOption, TimeEntry } from "../types";

export function TimeTracker() {
  const timer = useTimer();
  const store = useStore();
  useStoreRevision();
  const [durationFormat, setDurationFormat] = useDurationFormat();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [csv, setCsv] = useState("date,start,end,description,project,task,tags,billable\n");
  const [importNote, setImportNote] = useState("");
  const [bulkProject, setBulkProject] = useState("");
  const [bulkTag, setBulkTag] = useState("");
  const favorites = store.listFavorites();
  const [preset, setPreset] = useState<(typeof favorites)[number] | null>(null);
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
      {favorites.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {favorites.map((favorite) => (
            <button
              key={favorite.id}
              onClick={() => setPreset(favorite)}
              style={btn(theme.surfaceAlt, theme.text, { fontSize: 12 })}
              title="Use this favorite"
            >
              ★ {favorite.description}
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  store.deleteFavorite(favorite.id);
                }}
                style={{ marginLeft: 6, color: theme.textFaint }}
              >
                ×
              </span>
            </button>
          ))}
        </div>
      )}

      {timer.isIdle ? <Composer timer={timer} preset={preset} /> : <SessionBar timer={timer} />}

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
        <button onClick={() => setImporting(true)} style={btn(theme.surfaceAlt, theme.text)}>
          Import
        </button>
      </div>

      {selected.length > 0 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: theme.textMuted }}>{selected.length} selected</span>
          <select value={bulkProject} onChange={(e) => setBulkProject(e.target.value)} style={fieldStyle}>
            <option value="">Project…</option>
            {store.listActiveProjects().map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
          <select value={bulkTag} onChange={(e) => setBulkTag(e.target.value)} style={fieldStyle}>
            <option value="">Add tag…</option>
            {store.listTags().map((tag) => (
              <option key={tag.id} value={tag.id}>{tag.name}</option>
            ))}
          </select>
          <button
            onClick={() => {
              store.bulkUpdateEntries(selected, {
                ...(bulkProject ? { projectId: bulkProject } : {}),
                ...(bulkTag ? { addTagId: bulkTag } : {}),
              });
              setSelected([]);
            }}
            style={btn(theme.accent, theme.accentInk)}
          >
            Apply
          </button>
          <button onClick={() => { store.bulkUpdateEntries(selected, { isBillable: true }); setSelected([]); }} style={btn(theme.surfaceAlt, theme.text)}>
            Billable
          </button>
          <button onClick={() => { store.bulkUpdateEntries(selected, { isBillable: false }); setSelected([]); }} style={btn(theme.surfaceAlt, theme.text)}>
            Non-billable
          </button>
        </div>
      )}

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
                selected={Boolean(entry.id && selected.includes(entry.id))}
                onToggle={() => {
                  if (!entry.id) return;
                  setSelected((current) => (current.includes(entry.id!) ? current.filter((id) => id !== entry.id) : [...current, entry.id!]));
                }}
                onFavorite={() => {
                  if (!entry.id || entry.kind === "break") return;
                  store.saveFavorite({
                    description: entry.desc,
                    projectId: entry.projectId ?? null,
                    taskId: entry.taskId ?? null,
                    isBillable: entry.billable,
                    tagIds: entry.tagIds ?? [],
                  });
                }}
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
      {importing && (
        <Modal title="Import timesheet" onClose={() => setImporting(false)}>
          <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 8 }}>
            Columns: date, start, end, description, project, task, tags, billable. Tags use | between names.
          </div>
          <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={8} style={{ ...fieldStyle, width: "100%", fontFamily: "inherit" }} />
          {importNote && <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 8 }}>{importNote}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
            <button onClick={() => setImporting(false)} style={btn(theme.surfaceAlt, theme.text)}>Close</button>
            <button
              onClick={() => {
                const result = store.importTimesheetCsv(csv);
                setImportNote(`Imported ${result.created}. ${result.errors.slice(0, 3).join(" ")}`);
              }}
              style={btn(theme.accent, theme.accentInk)}
            >
              Import
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Composer({ timer, preset }: { timer: ReturnType<typeof useTimer>; preset: { description: string; projectId: string | null; taskId: string | null; isBillable: boolean; tagIds: string[] } | null }) {
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("");
  const [billable, setBillable] = useState(true);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [mode, setMode] = useState<"timer" | "manual">("timer");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [error, setError] = useState("");
  const [forUserId, setForUserId] = useState("");
  const [custom, setCustom] = useState<Record<string, string>>({});

  const store = useStore();
  const managing = store.canManage();
  const forceTimer = store.workspacePolicy().forceTimer && !managing;
  const users = store.listUsers();
  const customFields = store.listFieldDefs("time_entry");
  useEffect(() => {
    if (!preset) return;
    setDescription(preset.description);
    setProjectId(preset.projectId ?? "");
    setTaskId(preset.taskId ?? "");
    setBillable(preset.isBillable);
    setTagIds(preset.tagIds);
  }, [preset]);
  const tasks = projectId ? store.listTasks(projectId) : [];
  const [taskId, setTaskId] = useState("");
  const selected = timer.projects.find((p) => p.id === projectId);

  const start = () => {
    try {
      setError("");
    timer.start({
      description: description.trim() || "No description",
      projectId: projectId || null,
      taskId: taskId || null,
      isBillable: selected ? selected.isBillable && billable : billable,
      tagIds,
      customFields: customFields.map((field) => ({ fieldId: field.id, value: custom[field.id] ?? "" })),
    });
    setDescription("");
    setTagIds([]);
    setTaskId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
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
        forUserId: forUserId || null,
        customFields: customFields.map((field) => ({ fieldId: field.id, value: custom[field.id] ?? "" })),
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
        {!forceTimer && <ModeToggle mode={mode} onChange={setMode} />}
      </div>
      {(managing || customFields.length > 0) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {managing && (
            <select value={forUserId} onChange={(e) => setForUserId(e.target.value)} style={fieldStyle}>
              <option value="">Add for myself</option>
              {users.filter((user) => user.id !== store.userId).map((user) => (
                <option key={user.id} value={user.id}>Add for {user.name}</option>
              ))}
            </select>
          )}
          {customFields.map((field) => (
            <input
              key={field.id}
              value={custom[field.id] ?? ""}
              onChange={(e) => setCustom({ ...custom, [field.id]: e.target.value })}
              placeholder={field.required ? `${field.name} *` : field.name}
              style={fieldStyle}
            />
          ))}
        </div>
      )}
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
  onToggle,
  onFavorite,
  selected,
  durationFormat,
}: {
  entry: TimeEntry;
  canRestart: boolean;
  onRestart: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onFavorite: () => void;
  selected: boolean;
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
        gridTemplateColumns: "22px minmax(160px,1.6fr) minmax(160px,1.3fr) minmax(90px,0.8fr) 22px 110px 72px 28px 36px",
        alignItems: "center",
        gap: 10,
        padding: "9px 16px",
        borderTop: `1px solid ${theme.border}`,
        cursor: "pointer",
        opacity: isBreak ? 0.85 : 1,
        background: isBreak ? "rgba(224,133,133,0.06)" : undefined,
      }}
    >
      <input
        type="checkbox"
        checked={selected}
        onClick={(e) => e.stopPropagation()}
        onChange={onToggle}
      />
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
          onFavorite();
        }}
        title="Save as favorite entry"
        style={{ background: "none", border: "none", cursor: "pointer", color: theme.textFaint, fontSize: 13 }}
      >
        ★
      </button>
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
