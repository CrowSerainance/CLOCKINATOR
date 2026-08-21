import { useMemo, useState } from "react";
import { theme } from "../theme";
import { useStore, useStoreRevision } from "../hooks/useClockinator";
import { useDurationFormat } from "../hooks/useDurationFormat";
import { formatDisplayDuration } from "../domain/preferences";
import { addDays, startOfLocalDay, startOfLocalWeek } from "../domain/duration";
import { downloadBlob, downloadTextFile, buildTimeSummaryPdf, toCsv } from "../domain/reports";
import { btn, card, fieldStyle, pagePad } from "../components/ui";
import { formatAmount } from "../domain/money";

type RangePreset = "week" | "last7" | "last30";

export function Reports() {
  const store = useStore();
  useStoreRevision();
  const [durationFormat, setDurationFormat] = useDurationFormat();
  const [preset, setPreset] = useState<RangePreset>("last30");
  const [tab, setTab] = useState<"summary" | "detailed">("summary");
  const [groupBy, setGroupBy] = useState<"project" | "description">("project");
  const [client, setClient] = useState("");
  const [project, setProject] = useState("");
  const range = useMemo(() => rangeFor(preset), [preset]);
  const report = store.report(range.from.toISOString(), range.to.toISOString());
  const clients = store.listClients();
  const projects = store.listActiveProjects();
  const fmt = (seconds: number) => formatDisplayDuration(seconds, durationFormat);

  const groups = report.groups.filter((g) => {
    if (project && g.title !== project) return false;
    if (!client) return true;
    const match = projects.find((p) => p.name === g.title);
    return (match?.clientName ?? "") === client;
  });
  const grouped =
    groupBy === "project"
      ? groups
      : (() => {
          const map = new Map<string, { title: string; color: string; seconds: number }>();
          for (const row of report.csvRows.filter((r) => r.kind === "work")) {
            if (project && row.project !== project) continue;
            const title = row.description || "(no description)";
            const current = map.get(title) ?? { title, color: "#7d776e", seconds: 0 };
            current.seconds += Number(row.duration_hours) * 3600;
            map.set(title, current);
          }
          return [...map.values()].sort((a, b) => b.seconds - a.seconds);
        })();
  const filteredSeconds = grouped.reduce((s, g) => s + g.seconds, 0);
  const maxDay = Math.max(1, ...report.daily.map((d) => d.seconds));

  const exportCsv = () => {
    const csv = toCsv(
      ["entry_id", "user", "project", "task", "tags", "description", "kind", "start_at", "end_at", "duration_hours", "billable", "billable_rate", "cost_rate"],
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
        row.cost_rate,
      ]),
    );
    downloadTextFile(`clockinator-report.csv`, csv, "text/csv;charset=utf-8");
  };

  const exportPdf = () => {
    const workRows = report.csvRows.filter((r) => r.kind === "work");
    const byProject = new Map<string, { seconds: number; amount: number }>();
    const byDescription = new Map<string, { seconds: number; amount: number }>();
    const nested = new Map<string, { seconds: number; children: Map<string, { seconds: number; amount: number }> }>();

    for (const row of workRows) {
      if (project && row.project !== project) continue;
      if (client) {
        const match = projects.find((p) => p.name === row.project);
        if ((match?.clientName ?? "") !== client) continue;
      }
      const seconds = Math.round(Number(row.duration_hours) * 3600);
      const amount = row.billable ? (Number(row.duration_hours) * Number(row.billable_rate || 0)) : 0;
      const projectTitle = row.project ?? "No project";
      const descTitle = row.description || "(no description)";

      const p = byProject.get(projectTitle) ?? { seconds: 0, amount: 0 };
      p.seconds += seconds;
      p.amount += amount;
      byProject.set(projectTitle, p);

      const d = byDescription.get(descTitle) ?? { seconds: 0, amount: 0 };
      d.seconds += seconds;
      d.amount += amount;
      byDescription.set(descTitle, d);

      const n = nested.get(projectTitle) ?? { seconds: 0, children: new Map() };
      n.seconds += seconds;
      const child = n.children.get(descTitle) ?? { seconds: 0, amount: 0 };
      child.seconds += seconds;
      child.amount += amount;
      n.children.set(descTitle, child);
      nested.set(projectTitle, n);
    }

    const totalSeconds = [...byProject.values()].reduce((s, v) => s + v.seconds, 0);
    const totalAmount = [...byProject.values()].reduce((s, v) => s + v.amount, 0);

    const blob = buildTimeSummaryPdf({
      title: "Summary report",
      from: range.from,
      toExclusive: range.to,
      totalSeconds,
      subtitle: `Billable amount: $${formatAmount(totalAmount)} · Labor: $${formatAmount(report.laborCost)} · Profit: $${formatAmount(report.profit)}`,
      byProject: [...byProject.entries()]
        .map(([title, v]) => ({ title, seconds: v.seconds, amount: `$${formatAmount(v.amount)}` }))
        .sort((a, b) => b.seconds - a.seconds),
      byDescription: [...byDescription.entries()]
        .map(([title, v]) => ({ title, seconds: v.seconds, amount: `$${formatAmount(v.amount)}` }))
        .sort((a, b) => b.seconds - a.seconds),
      nested: [...nested.entries()]
        .map(([projectName, v]) => ({
          project: projectName,
          seconds: v.seconds,
          children: [...v.children.entries()]
            .map(([title, c]) => ({ title, seconds: c.seconds, amount: `$${formatAmount(c.amount)}` }))
            .sort((a, b) => b.seconds - a.seconds),
        }))
        .sort((a, b) => b.seconds - a.seconds),
      workspaceName: store.workspaceName,
    });

    const fromLabel = range.from.toISOString().slice(0, 10);
    const toLabel = new Date(range.to.getTime() - 1).toISOString().slice(0, 10);
    downloadBlob(`Clockinator_Time_Report_Summary_${fromLabel}_${toLabel}.pdf`, blob);
  };

  const donut = donutGradient(grouped);

  return (
    <div style={pagePad}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginRight: 8 }}>Reports</div>
        <button onClick={() => setTab("summary")} style={btn(tab === "summary" ? theme.accent + "22" : "transparent", theme.text, { border: `1px solid ${tab === "summary" ? theme.accent + "55" : theme.border}` })}>
          Summary
        </button>
        <button onClick={() => setTab("detailed")} style={btn(tab === "detailed" ? theme.accent + "22" : "transparent", theme.text, { border: `1px solid ${tab === "detailed" ? theme.accent + "55" : theme.border}` })}>
          Detailed
        </button>
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
        <button
          onClick={() => setDurationFormat(durationFormat === "clock" ? "decimal" : "clock")}
          style={btn(theme.surfaceAlt, theme.textMuted, { fontSize: 12 })}
        >
          {durationFormat === "clock" ? "h:mm:ss" : "0.00h"}
        </button>
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
        {tab === "summary" && (
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as "project" | "description")} style={fieldStyle}>
            <option value="project">Group by project</option>
            <option value="description">Group by description</option>
          </select>
        )}
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

      <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>{fmt(report.totalSeconds)}</div>
      <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 16 }}>
        Billable {fmt(report.billableSeconds)} · ${report.amount.toFixed(2)} · Labor ${report.laborCost.toFixed(2)} · Profit ${report.profit.toFixed(2)}
        {filteredSeconds !== report.totalSeconds ? ` · Filtered ${fmt(filteredSeconds)}` : ""}
      </div>

      {tab === "summary" ? (
      <>
      <div style={{ ...card, padding: "16px 18px 10px", marginBottom: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: theme.textFaint, letterSpacing: ".06em", marginBottom: 12 }}>
          TIME BY DAY
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 160, overflowX: "auto" }}>
          {report.daily.map((day) => (
            <div key={day.key} title={`${day.label} · ${fmt(day.seconds)}`} style={{ flex: "1 0 18px", minWidth: 14, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
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
          {grouped.map((group) => (
            <div
              key={group.title}
              style={{ display: "grid", gridTemplateColumns: "1fr 120px 80px", gap: 16, padding: "12px 18px", borderTop: `1px solid ${theme.border}`, alignItems: "center" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: group.color, flexShrink: 0 }} />
                <span style={{ fontSize: 14, fontWeight: 600 }}>{group.title}</span>
              </div>
              <span className="mono" style={{ fontSize: 13 }}>{fmt(group.seconds)}</span>
              <span className="mono" style={{ fontSize: 13, color: theme.textMuted }}>
                {report.totalSeconds ? Math.round((group.seconds / report.totalSeconds) * 100) : 0}%
              </span>
            </div>
          ))}
          {grouped.length === 0 && (
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
              <span className="mono" style={{ fontSize: 13, fontWeight: 700 }}>{fmt(report.totalSeconds)}</span>
              <span style={{ fontSize: 10, color: theme.textFaint }}>TOTAL</span>
            </div>
          </div>
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
            {grouped.slice(0, 6).map((group) => (
              <div key={group.title} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: theme.textMuted }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: group.color }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{group.title}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      </>
      ) : (
        <div style={card}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(140px,1.4fr) 1fr 0.8fr 90px 80px 70px",
              gap: 10,
              padding: "12px 18px",
              fontSize: 11,
              fontWeight: 700,
              color: theme.textFaint,
              letterSpacing: ".06em",
              background: theme.surfaceAlt,
            }}
          >
            <span>DESCRIPTION</span>
            <span>PROJECT</span>
            <span>TAGS</span>
            <span>START</span>
            <span>DURATION</span>
            <span>BILL</span>
          </div>
          {report.csvRows
            .filter((row) => row.kind === "work")
            .filter((row) => !project || row.project === project)
            .map((row) => (
              <div
                key={row.entry_id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(140px,1.4fr) 1fr 0.8fr 90px 80px 70px",
                  gap: 10,
                  padding: "10px 18px",
                  borderTop: `1px solid ${theme.border}`,
                  alignItems: "center",
                  fontSize: 13,
                }}
              >
                <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.description || "(no description)"}</span>
                <span style={{ color: theme.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.project ?? "No project"}</span>
                <span style={{ color: theme.textFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.tags ?? ""}</span>
                <span className="mono" style={{ fontSize: 12 }}>{new Date(row.start_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                <span className="mono">{fmt(Math.round(Number(row.duration_hours) * 3600))}</span>
                <span style={{ color: row.billable ? theme.accent : theme.textFaint }}>{row.billable ? "$" : "—"}</span>
              </div>
            ))}
        </div>
      )}
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
  const fmtDate = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmtDate(from)} – ${fmtDate(to)}`;
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
