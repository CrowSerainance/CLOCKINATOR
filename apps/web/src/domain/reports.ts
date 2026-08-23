export function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const escape = (value: string | number | null | undefined) => {
    const text = value == null ? "" : String(value);
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };
  return [headers.map(escape).join(","), ...rows.map((row) => row.map(escape).join(","))].join("\r\n") + "\r\n";
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadTextFile(filename: string, contents: string, mime: string): void {
  downloadBlob(filename, new Blob([contents], { type: mime }));
}

export { buildSummaryPdf, textToPdf, withPercents } from "./pdf";
export type { PdfRow, PdfSection, SummaryPdfInput } from "./pdf";

import { buildSummaryPdf, withPercents, type PdfSection } from "./pdf";

export function formatPdfDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function formatPdfRange(from: Date, toInclusive: Date): string {
  return `${formatPdfDate(from)} - ${formatPdfDate(toInclusive)}`;
}

/** Build the Clockify-style summary PDF used by Reports (and invoices). */
export function buildTimeSummaryPdf(input: {
  title?: string;
  from: Date;
  toExclusive: Date;
  totalSeconds: number;
  subtitle?: string;
  byProject: Array<{ title: string; seconds: number; amount?: string }>;
  byDescription: Array<{ title: string; seconds: number; amount?: string }>;
  /** Nested: project → descriptions */
  nested: Array<{ project: string; seconds: number; children: Array<{ title: string; seconds: number; amount?: string }> }>;
  workspaceName: string;
}): Blob {
  const toInclusive = new Date(input.toExclusive.getTime() - 1);
  const sections: PdfSection[] = [
    {
      heading: "Project",
      rows: withPercents(input.byProject.map((p) => ({ label: p.title, durationSeconds: p.seconds, amount: p.amount }))),
    },
    {
      heading: "Description",
      rows: withPercents(input.byDescription.map((d) => ({ label: d.title, durationSeconds: d.seconds, amount: d.amount }))),
    },
    {
      heading: "Project / Description Duration",
      rows: input.nested.flatMap((p) => [
        { label: p.project, durationSeconds: p.seconds },
        ...p.children.map((c) => ({
          label: c.title,
          durationSeconds: c.seconds,
          amount: c.amount,
          indent: true as const,
        })),
      ]),
    },
  ];

  return buildSummaryPdf({
    title: input.title ?? "Summary report",
    rangeLabel: formatPdfRange(input.from, toInclusive),
    totalSeconds: input.totalSeconds,
    subtitle: input.subtitle,
    sections,
    workspaceName: input.workspaceName,
  });
}
