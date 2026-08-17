import { useMemo, useState } from "react";
import { theme } from "../theme";
import { useStore, useStoreRevision } from "../hooks/useClockinator";
import { addDays, formatDuration, formatHours, startOfLocalDay, startOfLocalWeek } from "../domain/duration";
import { downloadBlob, downloadTextFile, textToPdf, toCsv } from "../domain/reports";
import { btn, card, fieldStyle, pagePad } from "../components/ui";

type RangePreset = "week" | "last7" | "last30";

export function Reports() {
  const store = useStore();
  useStoreRevision();
  const [preset, setPreset] = useState<RangePreset>("last30");
  const [client, setClient] = useState("");
  const [project, setProject] = useState("");
  const range = useMemo(() => rangeFor(preset), [preset]);
  const report = store.report(range.from.toISOString(), range.to.toISOString());
  const clients = store.listClients();
  const projects = store.listActiveProjects();

  const groups = report.groups.filter((g) => {
    if (project && g.title !== project) return false;
    if (!client) return true;
    const match = projects.find((p) => p.name === g.title);
    return (match?.clientName ?? "") === client;
  });
  const filteredSeconds = groups.reduce((s, g) => s + g.seconds, 0);
  const maxDay = Math.max(1, ...report.daily.map((d) => d.seconds));

  const exportCsv = () => {
    const csv = toCsv(
      ["entry_id", "user", "project", "task", "tags", "description", "kind", "start_at", "end_at", "duration_hours", "billable", "billable_rate"],
      report.csvRows.map((row) => [
        row.entry_id,
        row.user_email,
        row.project,
        row.task,
        row.tags,
        row.description,
        row.kind,
        row.start_at,
        row.end_at,
        Number(row.duration_hours).toFixed(2),
        row.billable ? "true" : "false",
        row.billable_rate,
      ]),
    );
    downloadTextFile(`clockinator-report.csv`, csv, "text/csv;charset=utf-8");
  };

  const exportPdf = () => {
    const lines = [
      `Range: ${range.label}`,
      `Total: ${formatDuration(report.totalSeconds)}   Billable: ${formatDuration(report.billableSeconds)}   Amount: $${report.amount.toFixed(2)}`,
      "",
      "By project",
      ...report.groups.map((g) => `${g.title.padEnd(32, " ")} ${formatDuration(g.seconds)}  (${formatHours(g.seconds)}h)`),
    ];
    downloadBlob("clockinator-report.pdf", textToPdf("Clockinator report", lines));
  };

  const donut = donutGradient(groups);

  return (
    <div style={pagePad}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginRight: 8 }}>Summary</div>
        {(["week", "last7", "last30"] as const).map((key) => (
          <button
            key={key}
            onClick={() => setPreset(key)}
            style={btn(preset === key ? theme.accent + "22" : theme.surfaceAlt, preset === key ? theme.text : theme.textMuted, {
              border: `1px solid ${preset === key ? theme.accent + "55" : theme.border}`,
            })}
          >
            {key === "week" ? "This week" : key === "last7" ? "Last 7 days" : "Last 30 days"}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: theme.textMuted }}>{range.label}</span>
        <button onClick={exportCsv} style={btn(theme.surfaceAlt, theme.text)}>
          Export CSV
        </button>
        <button onClick={exportPdf} style={btn(theme.accent, theme.accentInk)}>
          Export PDF
        </button>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 18,
          padding: "10px 12px",
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: 12,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: theme.textFaint, letterSpacing: ".08em" }}>FILTER</span>
        <select value={client} onChange={(e) => setClient(e.target.value)} style={fieldStyle}>
          <option value="">Client</option>
          {clients.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={project} onChange={(e) => setProject(e.target.value)} style={fieldStyle}>
          <option value="">Project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
        {(client || project) && (
          <button
            onClick={() => {
              setClient("");
              setProject("");
            }}
            style={btn(theme.surfaceAlt, theme.textMuted)}
          >
            Clear
          </button>
        )}
      </div>

      <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>{formatDuration(report.totalSeconds)}</div>
      <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 16 }}>
        Billable {formatDuration(report.billableSeconds)} · ${report.amount.toFixed(2)}
        {filteredSeconds !== report.totalSeconds ? ` · Filtered ${formatDuration(filteredSeconds)}` : ""}
      </div>

      <div style={{ ...card, padding: "16px 18px 10px", marginBottom: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: theme.textFaint, letterSpacing: ".06em", marginBottom: 12 }}>
          TIME BY DAY
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 160, overflowX: "auto" }}>
          {report.daily.map((day) => (
            <div key={day.key} title={`${day.label} · ${formatDuration(day.seconds)}`} style={{ flex: "1 0 18px", minWidth: 14, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
              <div style={{ display: "flex", flexDirection: "column-reverse", height: `${Math.max(4, (day.seconds / maxDay) * 100)}%`, borderRadius: 3, overflow: "hidden" }}>
                {day.stacks.map((stack) => (
                  <div
                    key={stack.title}
                    style={{
                      height: `${day.seconds ? (stack.seconds / day.seconds) * 100 : 0}%`,
                      background: stack.color,
                      minHeight: stack.seconds ? 2 : 0,
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 11, color: theme.textFaint }}>
          <span>{report.daily[0]?.label ?? ""}</span>
          <span>{report.daily.at(-1)?.label ?? ""}</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) 280px", gap: 16 }}>
        <div style={card}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 80px", gap: 16, padding: "12px 18px", fontSize: 11, fontWeight: 700, color: theme.textFaint, letterSpacing: ".06em" }}>
            <span>PROJECT</span>
            <span>DURATION</span>
            <span>SHARE</span>
          </div>
          {groups.map((group) => (
            <div
              key={group.title}
              style={{ display: "grid", gridTemplateColumns: "1fr 120px 80px", gap: 16, padding: "12px 18px", borderTop: `1px solid ${theme.border}`, alignItems: "center" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: group.color, flexShrink: 0 }} />
                <span style={{ fontSize: 14, fontWeight: 600 }}>{group.title}</span>
              </div>
              <span className="mono" style={{ fontSize: 13 }}>{formatDuration(group.seconds)}</span>
              <span className="mono" style={{ fontSize: 13, color: theme.textMuted }}>
                {report.totalSeconds ? Math.round((group.seconds / report.totalSeconds) * 100) : 0}%
              </span>
            </div>
          ))}
          {groups.length === 0 && (
            <div style={{ padding: "28px 18px", color: theme.textMuted, fontSize: 13 }}>No completed entries in this range.</div>
          )}
        </div>

        <div style={{ ...card, padding: 22, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
          <div
            style={{
              width: 168,
              height: 168,
              borderRadius: "50%",
              background: donut,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 96,
                height: 96,
                borderRadius: "50%",
                background: theme.surface,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <span className="mono" style={{ fontSize: 13, fontWeight: 700 }}>{formatDuration(report.totalSeconds)}</span>
              <span style={{ fontSize: 10, color: theme.textFaint }}>TOTAL</span>
            </div>
          </div>
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
            {groups.slice(0, 6).map((group) => (
              <div key={group.title} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: theme.textMuted }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: group.color }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{group.title}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function rangeFor(preset: RangePreset): { from: Date; to: Date; label: string } {
  const now = new Date();
  const to = addDays(startOfLocalDay(now), 1);
  if (preset === "week") {
    const from = startOfLocalWeek(now);
    return { from, to: addDays(from, 7), label: labelRange(from, addDays(from, 6)) };
  }
  if (preset === "last7") {
    const from = addDays(startOfLocalDay(now), -6);
    return { from, to, label: labelRange(from, now) };
  }
  const from = addDays(startOfLocalDay(now), -29);
  return { from, to, label: labelRange(from, now) };
}

function labelRange(from: Date, to: Date): string {
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(from)} – ${fmt(to)}`;
}

function donutGradient(groups: Array<{ color: string; seconds: number }>): string {
  const total = groups.reduce((s, g) => s + g.seconds, 0);
  if (!total) return theme.surfaceAlt;
  let cursor = 0;
  const stops: string[] = [];
  for (const group of groups) {
    const start = (cursor / total) * 360;
    cursor += group.seconds;
    const end = (cursor / total) * 360;
    stops.push(`${group.color} ${start}deg ${end}deg`);
  }
  return `conic-gradient(${stops.join(", ")})`;
}
