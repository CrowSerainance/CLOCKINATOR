import { useState } from "react";
import { theme } from "../theme";
import { projects as seed } from "../data/sample";
import type { ProjectRow } from "../types";

const COLS = "minmax(220px,2fr) 1.2fr 0.8fr 1.4fr 0.7fr 0.8fr 44px";

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
        borderBottom: `1px solid ${theme.border}`,
      }}
    >
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

function Row({ project, onToggleFavorite }: { project: ProjectRow; onToggleFavorite: () => void }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: COLS,
        gap: 16,
        alignItems: "center",
        padding: "14px 18px",
        borderTop: `1px solid ${theme.border}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: project.color, flexShrink: 0 }} />
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
        onClick={onToggleFavorite}
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
  const [rows, setRows] = useState<ProjectRow[]>(seed);
  const [filter, setFilter] = useState<"all" | "favorites">("all");

  const visible = filter === "favorites" ? rows.filter((r) => r.favorite) : rows;

  const toggleFavorite = (name: string) =>
    setRows((prev) => prev.map((r) => (r.name === name ? { ...r, favorite: !r.favorite } : r)));

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
    <div style={{ padding: "26px 30px", overflowY: "auto", flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {chip("all", "All projects")}
          {chip("favorites", "★ Favorites")}
        </div>
        <button
          style={{ background: theme.accent, color: theme.accentInk, border: "none", borderRadius: 10, padding: "10px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
        >
          + New project
        </button>
      </div>

      <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 14, overflow: "hidden" }}>
        <Header />
        {visible.map((p) => (
          <Row key={p.name} project={p} onToggleFavorite={() => toggleFavorite(p.name)} />
        ))}
        {visible.length === 0 && (
          <div style={{ padding: "28px 18px", textAlign: "center", color: theme.textMuted, fontSize: 13 }}>No favorite projects yet.</div>
        )}
      </div>
    </div>
  );
}
