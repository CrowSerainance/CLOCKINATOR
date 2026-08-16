import { useState, type CSSProperties } from "react";
import { theme } from "../theme";
import { useTimer } from "../hooks/useTimer";
import type { TimeEntry } from "../types";

function fmtButton(background: string, color: string): CSSProperties {
  return {
    background,
    color,
    border: "none",
    borderRadius: 10,
    padding: "10px 16px",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
  };
}

export function TimeTracker() {
  const timer = useTimer();

  return (
    <div style={{ padding: "26px 30px", overflowY: "auto", flex: 1 }}>
      {timer.isIdle ? <Composer timer={timer} /> : <SessionBar timer={timer} />}

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>This week</div>
        <div style={{ fontSize: 13, color: theme.textMuted }}>
          Week total <span className="mono" style={{ color: theme.text, fontWeight: 600 }}>{timer.weekTotal}</span>
        </div>
      </div>

      {timer.groups.length === 0 && (
        <div style={{ color: theme.textMuted, fontSize: 14, padding: "20px 4px" }}>No time entries this week yet.</div>
      )}

      {timer.groups.map((group) => (
        <div
          key={group.dayKey ?? group.label}
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
          {group.entries.map((entry) => (
            <EntryRow
              key={entry.id ?? `${entry.desc}-${entry.start}`}
              entry={entry}
              canRestart={timer.isIdle && Boolean(entry.id)}
              onRestart={() => {
                if (entry.id) timer.restartFrom(entry.id);
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function Composer({ timer }: { timer: ReturnType<typeof useTimer> }) {
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("");
  const [billable, setBillable] = useState(true);

  const start = () => {
    const selected = timer.projects.find((p) => p.id === projectId);
    timer.start({
      description: description.trim() || "No description",
      projectId: projectId || null,
      isBillable: selected ? selected.isBillable && billable : billable,
    });
    setDescription("");
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: 14,
        padding: "12px 16px",
        marginBottom: 22,
      }}
    >
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") start();
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
          const project = timer.projects.find((p) => p.id === id);
          if (project) setBillable(project.isBillable);
        }}
        style={{
          background: theme.surfaceAlt,
          color: theme.text,
          border: `1px solid ${theme.border}`,
          borderRadius: 8,
          padding: "8px 10px",
          fontSize: 13,
          maxWidth: 220,
        }}
      >
        <option value="">No project</option>
        {timer.projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
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
      <span className="mono" style={{ fontSize: 22, fontWeight: 600, width: 96, textAlign: "right" }}>
        0:00:00
      </span>
      <button onClick={start} style={fmtButton(theme.accent, theme.accentInk)}>
        START
      </button>
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
        borderRadius: 14,
        padding: "16px 18px",
        marginBottom: 22,
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
          <button onClick={() => timer.pause()} style={fmtButton(theme.surfaceAlt, theme.text)}>
            Pause
          </button>
          <button onClick={() => timer.split()} style={fmtButton(theme.surfaceAlt, theme.text)}>
            Split
          </button>
          <button onClick={() => timer.beginBreak()} style={fmtButton(theme.surfaceAlt, theme.text)}>
            Break
          </button>
        </>
      )}
      {timer.isPaused && (
        <button onClick={() => timer.resume()} style={fmtButton(theme.accent, theme.accentInk)}>
          Resume
        </button>
      )}
      {timer.isOnBreak && (
        <button onClick={() => timer.finishBreak()} style={fmtButton(theme.accent, theme.accentInk)}>
          End break
        </button>
      )}
      <button onClick={() => timer.stop()} style={fmtButton(theme.danger, "#1c1a18")}>
        Stop
      </button>
    </div>
  );
}

function EntryRow({ entry, canRestart, onRestart }: { entry: TimeEntry; canRestart: boolean; onRestart: () => void }) {
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
        <span style={{ fontSize: 13, color: theme.textFaint }}>{entry.client ? `· ${entry.client}` : ""}</span>
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
      <button
        onClick={onRestart}
        disabled={!canRestart}
        title="Continue this entry"
        style={{
          background: "none",
          border: "none",
          cursor: canRestart ? "pointer" : "default",
          color: canRestart ? theme.textMuted : theme.border,
          fontSize: 14,
          padding: 4,
        }}
      >
        ▶
      </button>
    </div>
  );
}
