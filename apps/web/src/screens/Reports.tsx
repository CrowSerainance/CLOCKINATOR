import { useState } from "react";
import { theme } from "../theme";
import { useStore, useStoreRevision } from "../hooks/useClockinator";
import { addDays, formatDuration, formatHours, startOfLocalWeek } from "../domain/duration";
import { downloadBlob, downloadTextFile, textToPdf, toCsv } from "../domain/reports";

export function Reports() {
  const store = useStore();
  useStoreRevision();
  const weekStart = startOfLocalWeek(new Date());
  const [from, setFrom] = useState(toInput(weekStart));
  const [to, setTo] = useState(toInput(addDays(weekStart, 7)));

  const fromIso = new Date(from).toISOString();
  const toIso = new Date(to).toISOString();
  const report = store.report(fromIso, toIso);

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
      `Range: ${from} → ${to}`,
      `Total: ${formatDuration(report.totalSeconds)}   Billable: ${formatDuration(report.billableSeconds)}   Amount: $${report.amount.toFixed(2)}`,
      "",
      "By project",
      ...report.groups.map((g) => `${g.title.padEnd(32, " ")} ${formatDuration(g.seconds)}  (${formatHours(g.seconds)}h)`),
    ];
    downloadBlob("clockinator-report.pdf", textToPdf("Clockinator report", lines));
  };

  return (
    <div style={{ padding: "26px 30px", overflowY: "auto", flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22, flexWrap: "wrap" }}>
        <label style={{ fontSize: 13, color: theme.textMuted }}>
          From{" "}
          <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ fontSize: 13, color: theme.textMuted }}>
          To{" "}
          <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} />
        </label>
        <div style={{ flex: 1 }} />
        <button onClick={exportCsv} style={btn(theme.surfaceAlt, theme.text)}>
          Export CSV
        </button>
        <button onClick={exportPdf} style={btn(theme.accent, theme.accentInk)}>
          Export PDF
        </button>
      </div>

      <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 6 }}>{formatDuration(report.totalSeconds)}</div>
      <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 22 }}>
        Billable {formatDuration(report.billableSeconds)} · ${report.amount.toFixed(2)}
      </div>

      <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 80px", gap: 16, padding: "12px 18px", fontSize: 11, fontWeight: 700, color: theme.textFaint, letterSpacing: ".06em" }}>
          <span>TITLE</span>
          <span>DURATION</span>
          <span>SHARE</span>
        </div>
        {report.groups.map((group) => (
          <div
            key={group.title}
            style={{ display: "grid", gridTemplateColumns: "1fr 120px 80px", gap: 16, padding: "14px 18px", borderTop: `1px solid ${theme.border}`, alignItems: "center" }}
          >
            <span style={{ fontSize: 14, fontWeight: 600 }}>{group.title}</span>
            <span className="mono" style={{ fontSize: 13 }}>{formatDuration(group.seconds)}</span>
            <span className="mono" style={{ fontSize: 13, color: theme.textMuted }}>
              {report.totalSeconds ? Math.round((group.seconds / report.totalSeconds) * 100) : 0}%
            </span>
          </div>
        ))}
        {report.groups.length === 0 && (
          <div style={{ padding: "28px 18px", color: theme.textMuted, fontSize: 13 }}>No completed entries in this range.</div>
        )}
      </div>
    </div>
  );
}

function toInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const inputStyle = {
  background: theme.surfaceAlt,
  color: theme.text,
  border: `1px solid ${theme.border}`,
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  marginLeft: 6,
};

function btn(background: string, color: string) {
  return {
    background,
    color,
    border: "none",
    borderRadius: 10,
    padding: "10px 16px",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer" as const,
  };
}
