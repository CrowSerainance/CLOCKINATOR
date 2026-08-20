import { useState } from "react";
import { theme } from "../theme";
import { useStore, useStoreRevision } from "../hooks/useClockinator";
import type { ProjectDraft, ProjectRow } from "../types";
import { btn, card, fieldStyle, pagePad } from "../components/ui";
import { toCsv, downloadTextFile } from "../domain/reports";
import { Modal, labelStyle } from "../components/Modal";
import { ColorDots } from "../components/EntryEditor";

const COLS = "32px minmax(200px,2fr) 1.2fr 0.8fr 1.4fr 0.7fr 0.8fr 44px";

function Header() {
  const cell = { fontSize: 11, fontWeight: 700, color: theme.textFaint, letterSpacing: ".06em" } as const;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: COLS,
        gap: 16,
        alignItems: "center",
        padding: "12px 18px",
        background: theme.surfaceAlt,
      }}
    >
      <span />
      <span style={cell}>NAME</span>
      <span style={cell}>CLIENT</span>
      <span style={cell}>TRACKED</span>
      <span style={cell}>PROGRESS</span>
      <span style={cell}>RATE</span>
      <span style={cell}>ACCESS</span>
      <span />
    </div>
  );
}

function Row({ project, onToggleFavorite, onEdit }: { project: ProjectRow; onToggleFavorite: () => void; onEdit: () => void }) {
  return (
    <div
      onClick={onEdit}
      style={{
        display: "grid",
        gridTemplateColumns: COLS,
        gap: 16,
        alignItems: "center",
        padding: "11px 18px",
        borderTop: `1px solid ${theme.border}`,
        cursor: "pointer",
      }}
    >
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: project.color, justifySelf: "center" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {project.name}
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, color: project.statusColor }}>· {project.status}</span>
      </div>

      <span style={{ fontSize: 13, color: theme.textMuted }}>{project.client}</span>
      <span className="mono" style={{ fontSize: 13 }}>{project.tracked}</span>

      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        {project.progress === null ? (
          <span style={{ fontSize: 13, color: theme.textFaint }}>{project.budget}</span>
        ) : (
          <>
            <div style={{ flex: 1, height: 6, borderRadius: 4, background: theme.surfaceAlt, overflow: "hidden", maxWidth: 120 }}>
              <div style={{ width: `${Math.min(project.progress * 100, 100)}%`, height: "100%", background: project.color }} />
            </div>
            <span className="mono" style={{ fontSize: 12, color: theme.textMuted, width: 64 }}>{project.budget}</span>
          </>
        )}
      </div>

      <span className="mono" style={{ fontSize: 13, color: project.rate === "—" ? theme.textFaint : "#a9c9b4" }}>{project.rate}</span>
      <span style={{ fontSize: 13, color: theme.textMuted, textTransform: "capitalize" }}>{project.access}</span>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        title={project.favorite ? "Unfavorite" : "Favorite"}
        style={{ background: "none", border: "none", cursor: "pointer", padding: 4, lineHeight: 0, color: project.favorite ? theme.accent : theme.textFaint }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill={project.favorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
          <path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 21.3 6.2 20.9l1.1-6.5L2.6 9.3l6.5-.9z" />
        </svg>
      </button>
    </div>
  );
}

export function Projects() {
  const store = useStore();
  useStoreRevision();
  const rows = store.listProjects();
  const clients = store.listClients();
  const [filter, setFilter] = useState<"all" | "favorites">("all");
  const [status, setStatus] = useState("all");
  const [client, setClient] = useState("all");
  const [access, setAccess] = useState("all");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<ProjectRow | "new" | null>(null);

  const visible = rows.filter((row) => {
    if (filter === "favorites" && !row.favorite) return false;
    if (status !== "all" && row.status !== status) return false;
    if (client !== "all" && row.client !== client) return false;
    if (access !== "all" && row.access !== access) return false;
    if (query.trim() && !row.name.toLowerCase().includes(query.trim().toLowerCase())) return false;
    return true;
  });

  const chip = (key: "all" | "favorites", label: string) => (
    <button
      onClick={() => setFilter(key)}
      style={{
        background: filter === key ? theme.accent + "20" : "transparent",
        color: filter === key ? theme.text : theme.textMuted,
        border: `1px solid ${filter === key ? theme.accent + "55" : theme.border}`,
        borderRadius: 8,
        padding: "6px 12px",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={pagePad}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>Projects</div>
        <button onClick={() => setDraft("new")} style={btn(theme.accent, theme.accentInk)}>
          + New project
        </button>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 14,
          padding: "10px 12px",
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: 12,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: theme.textFaint, letterSpacing: ".08em" }}>FILTER</span>
        {chip("all", "All")}
        {chip("favorites", "★ Favorites")}
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={fieldStyle}>
          <option value="all">Status</option>
          <option value="Active">Active</option>
          <option value="On hold">On hold</option>
          <option value="Non-billable">Non-billable</option>
        </select>
        <select value={client} onChange={(e) => setClient(e.target.value)} style={fieldStyle}>
          <option value="all">Client</option>
          {clients.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={access} onChange={(e) => setAccess(e.target.value)} style={fieldStyle}>
          <option value="all">Access</option>
          <option value="public">Public</option>
          <option value="private">Private</option>
        </select>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find by name" style={{ ...fieldStyle, flex: 1, minWidth: 160 }} />
        <button
          onClick={() => {
            downloadTextFile(
              "clockinator-projects.csv",
              toCsv(
                ["name", "client", "tracked", "budget", "rate", "status", "access"],
                visible.map((row) => [row.name, row.client, row.tracked, row.budget, row.rate, row.status, row.access]),
              ),
              "text/csv;charset=utf-8",
            );
          }}
          style={btn(theme.surfaceAlt, theme.text)}
        >
          Export
        </button>
      </div>

      <div style={card}>
        <Header />
        {visible.map((p) => (
          <Row
            key={p.id ?? p.name}
            project={p}
            onToggleFavorite={() => {
              if (p.id) store.setProjectFavorite(p.id, !p.favorite);
            }}
            onEdit={() => setDraft(p)}
          />
        ))}
        {visible.length === 0 && (
          <div style={{ padding: "28px 18px", textAlign: "center", color: theme.textMuted, fontSize: 13 }}>No projects match these filters.</div>
        )}
      </div>
      {draft && (
        <Modal title={draft === "new" ? "New project" : "Edit project"} onClose={() => setDraft(null)}>
          <ProjectForm
            project={draft === "new" ? undefined : draft}
            clients={clients}
            onCancel={() => setDraft(null)}
            onSave={(input) => {
              if (draft === "new") store.createProject(input);
              else if (draft.id) store.updateProject(draft.id, input);
              setDraft(null);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function ProjectForm({
  project,
  clients,
  onSave,
  onCancel,
}: {
  project?: ProjectRow;
  clients: Array<{ id: string; name: string }>;
  onSave: (input: ProjectDraft) => void;
  onCancel: () => void;
}) {
  const store = useStore();
  useStoreRevision();
  const [name, setName] = useState(project?.name ?? "");
  const [clientId, setClientId] = useState(project?.clientId ?? "");
  const [color, setColor] = useState(project?.color ?? "#5bbd7e");
  const [isBillable, setIsBillable] = useState(project?.isBillable ?? true);
  const [billableRate, setBillableRate] = useState(project?.billableRate ?? "");
  const [estimatedHours, setEstimatedHours] = useState(project?.estimatedHours ?? "");
  const [access, setAccess] = useState<"public" | "private">(project?.access ?? "public");
  const [status, setStatus] = useState<"active" | "on_hold" | "archived">((project?.rawStatus as "active" | "on_hold" | "archived") ?? "active");
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskRate, setNewTaskRate] = useState("");
  const tasks = project?.id ? store.listTasks(project.id) : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label>
        <span style={labelStyle}>NAME</span>
        <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...fieldStyle, width: "100%" }} />
      </label>
      <label>
        <span style={labelStyle}>CLIENT</span>
        <select value={clientId} onChange={(e) => setClientId(e.target.value)} style={{ ...fieldStyle, width: "100%" }}>
          <option value="">No client</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <div>
        <span style={labelStyle}>COLOR</span>
        <ColorDots value={color} onChange={setColor} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label>
          <span style={labelStyle}>RATE</span>
          <input value={billableRate} onChange={(e) => setBillableRate(e.target.value)} placeholder="160.00" style={{ ...fieldStyle, width: "100%" }} />
        </label>
        <label>
          <span style={labelStyle}>ESTIMATE (h)</span>
          <input value={estimatedHours} onChange={(e) => setEstimatedHours(e.target.value)} placeholder="40" style={{ ...fieldStyle, width: "100%" }} />
        </label>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <label>
          <span style={labelStyle}>ACCESS</span>
          <select value={access} onChange={(e) => setAccess(e.target.value as "public" | "private")} style={{ ...fieldStyle, width: "100%" }}>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </label>
        <label>
          <span style={labelStyle}>STATUS</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as "active" | "on_hold" | "archived")} style={{ ...fieldStyle, width: "100%" }}>
            <option value="active">Active</option>
            <option value="on_hold">On hold</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <label style={{ display: "flex", alignItems: "end", gap: 8, fontSize: 13, paddingBottom: 8 }}>
          <input type="checkbox" checked={isBillable} onChange={(e) => setIsBillable(e.target.checked)} />
          Billable
        </label>
      </div>

      {project?.id && (
        <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 12 }}>
          <div style={{ ...labelStyle, marginBottom: 8 }}>TASKS & RATES</div>
          {tasks.map((task) => (
            <TaskRateRow
              key={task.id}
              name={task.name}
              rate={task.billableRate ?? ""}
              onSave={(nextName, nextRate) => store.updateTask(task.id, { name: nextName, billableRate: nextRate })}
            />
          ))}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 72px", gap: 8, marginTop: 8 }}>
            <input
              value={newTaskName}
              onChange={(e) => setNewTaskName(e.target.value)}
              placeholder="New task"
              style={{ ...fieldStyle, width: "100%" }}
            />
            <input
              value={newTaskRate}
              onChange={(e) => setNewTaskRate(e.target.value)}
              placeholder="Rate"
              style={{ ...fieldStyle, width: "100%" }}
            />
            <button
              onClick={() => {
                if (!newTaskName.trim() || !project.id) return;
                store.createTask(project.id, newTaskName, newTaskRate || null);
                setNewTaskName("");
                setNewTaskRate("");
              }}
              style={btn(theme.surfaceAlt, theme.text)}
            >
              Add
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button onClick={onCancel} style={btn(theme.surfaceAlt, theme.text)}>
          Cancel
        </button>
        <button
          onClick={() => {
            if (!name.trim()) return;
            onSave({ name, clientId, color, isBillable, billableRate, estimatedHours, access, status });
          }}
          style={btn(theme.accent, theme.accentInk)}
        >
          Save
        </button>
      </div>
    </div>
  );
}

function TaskRateRow({
  name,
  rate,
  onSave,
}: {
  name: string;
  rate: string;
  onSave: (name: string, rate: string) => void;
}) {
  const [taskName, setTaskName] = useState(name);
  const [taskRate, setTaskRate] = useState(rate);
  const dirty = taskName !== name || taskRate !== rate;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 72px", gap: 8, marginBottom: 6 }}>
      <input value={taskName} onChange={(e) => setTaskName(e.target.value)} style={{ ...fieldStyle, width: "100%" }} />
      <input value={taskRate} onChange={(e) => setTaskRate(e.target.value)} placeholder="—" style={{ ...fieldStyle, width: "100%" }} />
      <button
        disabled={!dirty || !taskName.trim()}
        onClick={() => onSave(taskName, taskRate)}
        style={btn(dirty ? theme.accent : theme.surfaceAlt, dirty ? theme.accentInk : theme.textFaint)}
      >
        Save
      </button>
    </div>
  );
}
