import { formatDuration } from "./duration";

export interface PdfRow {
  label: string;
  durationSeconds: number;
  /** Share of section total, 0–100. Omit to hide. */
  percent?: number;
  /** Optional money column, e.g. "$320.00" */
  amount?: string;
  /** Indent nested description under a project */
  indent?: boolean;
}

export interface PdfSection {
  heading: string;
  rows: PdfRow[];
}

export interface SummaryPdfInput {
  title: string;
  /** e.g. "23/06/2026 - 22/07/2026" */
  rangeLabel: string;
  totalSeconds: number;
  /** Extra line under total, e.g. "Amount: $1,200.00" or "Client: Acme" */
  subtitle?: string;
  sections: PdfSection[];
  workspaceName: string;
  /** Defaults to "Created with Clockinator" */
  brandLine?: string;
}

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_X = 50;
const MARGIN_TOP = 72;
const MARGIN_BOTTOM = 56;
const LINE_H = 14;
const TITLE_SIZE = 16;
const BODY_SIZE = 10;
const COL_WIDTH = PAGE_W - MARGIN_X * 2;

function escapePdf(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** Approximate Helvetica advance for ASCII (enough for column layout). */
function textWidth(text: string, fontSize: number): number {
  let w = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code < 32) continue;
    // rough average width factor for Helvetica
    w += code < 127 ? 0.5 : 0.6;
  }
  return w * fontSize;
}

function formatPercent(n: number): string {
  return `${n.toFixed(2).replace(".", ",")}%`;
}

function formatRow(row: PdfRow): string {
  const prefix = row.indent ? "  " : "";
  const label = prefix + row.label;
  const dur = formatDuration(Math.max(0, Math.round(row.durationSeconds)));
  const parts = [dur];
  if (row.percent != null) parts.push(formatPercent(row.percent));
  if (row.amount) parts.push(row.amount);
  const right = parts.join("  ");
  const maxLeft = 88;
  const clipped = label.length > maxLeft ? `${label.slice(0, maxLeft - 1)}…` : label;
  const pad = Math.max(1, 92 - clipped.length - right.length);
  return clipped + " ".repeat(pad) + right;
}

function buildPageStream(lines: Array<{ text: string; size: number; gapAfter?: number }>, footer: string): string {
  const cmds: string[] = ["BT"];
  let y = PAGE_H - MARGIN_TOP;
  let first = true;
  for (const line of lines) {
    if (first) {
      cmds.push(`/F1 ${line.size} Tf`);
      cmds.push(`${MARGIN_X} ${y} Td`);
      first = false;
    } else {
      const gap = line.gapAfter ?? LINE_H;
      cmds.push(`/F1 ${line.size} Tf`);
      cmds.push(`0 -${gap} Td`);
    }
    cmds.push(`(${escapePdf(line.text)}) Tj`);
    y -= line.gapAfter ?? LINE_H;
  }
  cmds.push("ET");

  // Footer
  cmds.push("BT");
  cmds.push(`/F1 8 Tf`);
  cmds.push(`${MARGIN_X} 28 Td`);
  cmds.push(`(${escapePdf(footer)}) Tj`);
  cmds.push("ET");

  return cmds.join("\n");
}

/**
 * Multi-page summary PDF matching Clockify-style time report exports:
 * title, date range, total, grouped sections, nested Project/Description, footer.
 */
export function buildSummaryPdf(input: SummaryPdfInput): Blob {
  const brand = input.brandLine ?? "Created with Clockinator";
  const bodyLines: Array<{ text: string; size: number; gapAfter?: number }> = [];

  bodyLines.push({ text: input.title, size: TITLE_SIZE, gapAfter: 18 });
  bodyLines.push({ text: input.rangeLabel, size: BODY_SIZE, gapAfter: 14 });
  bodyLines.push({ text: `Total: ${formatDuration(Math.max(0, Math.round(input.totalSeconds)))}`, size: BODY_SIZE, gapAfter: 12 });
  if (input.subtitle) {
    bodyLines.push({ text: input.subtitle, size: BODY_SIZE, gapAfter: 16 });
  } else {
    bodyLines.push({ text: " ", size: BODY_SIZE, gapAfter: 8 });
  }

  for (const section of input.sections) {
    bodyLines.push({ text: section.heading, size: 11, gapAfter: 14 });
    if (section.rows.length === 0) {
      bodyLines.push({ text: "  (none)", size: BODY_SIZE, gapAfter: LINE_H });
    }
    for (const row of section.rows) {
      bodyLines.push({ text: formatRow(row), size: BODY_SIZE, gapAfter: LINE_H });
    }
    bodyLines.push({ text: " ", size: BODY_SIZE, gapAfter: 10 });
  }

  const usableHeight = PAGE_H - MARGIN_TOP - MARGIN_BOTTOM;
  const pages: Array<Array<{ text: string; size: number; gapAfter?: number }>> = [];
  let current: Array<{ text: string; size: number; gapAfter?: number }> = [];
  let used = 0;

  for (const line of bodyLines) {
    const h = line.gapAfter ?? LINE_H;
    if (current.length && used + h > usableHeight) {
      pages.push(current);
      current = [];
      used = 0;
    }
    current.push(line);
    used += h;
  }
  if (current.length) pages.push(current);
  if (pages.length === 0) pages.push([{ text: input.title, size: TITLE_SIZE }]);

  const contentStreams = pages.map((pageLines, i) => {
    const footer = `${input.workspaceName} ${brand} ${i + 1}`;
    return buildPageStream(pageLines, footer);
  });

  return assemblePdf(contentStreams);
}

function assemblePdf(contentStreams: string[]): Blob {
  const objects: string[] = [];
  // 1 Catalog, 2 Pages, 3..N+2 Pages kids, then contents, then font
  const pageCount = contentStreams.length;
  const pageObjIds = contentStreams.map((_, i) => 3 + i);
  const contentObjIds = contentStreams.map((_, i) => 3 + pageCount + i);
  const fontObjId = 3 + pageCount * 2;

  objects.push("<< /Type /Catalog /Pages 2 0 R >>"); // 1
  objects.push(
    `<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageCount} >>`,
  ); // 2

  for (let i = 0; i < pageCount; i++) {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentObjIds[i]} 0 R /Resources << /Font << /F1 ${fontObjId} 0 R >> >> >>`,
    );
  }
  for (const stream of contentStreams) {
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  const bodyParts = ["%PDF-1.4\n"];
  const offsets = [0];
  let pos = bodyParts[0].length;
  for (let i = 0; i < objects.length; i++) {
    offsets.push(pos);
    const obj = `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
    bodyParts.push(obj);
    pos += obj.length;
  }
  const xref = [
    "xref",
    `0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets.slice(1).map((n) => `${String(n).padStart(10, "0")} 00000 n `),
    "trailer",
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(pos),
    "%%EOF",
  ].join("\n");

  return new Blob([bodyParts.join("") + xref], { type: "application/pdf" });
}

/** @deprecated Prefer buildSummaryPdf — kept for one-off plain dumps. */
export function textToPdf(title: string, lines: string[]): Blob {
  return buildSummaryPdf({
    title,
    rangeLabel: "",
    totalSeconds: 0,
    sections: [
      {
        heading: "Details",
        rows: lines.filter(Boolean).map((label) => ({ label, durationSeconds: 0 })),
      },
    ],
    workspaceName: "Clockinator",
  });
}

export function withPercents(rows: Array<{ label: string; durationSeconds: number; amount?: string; indent?: boolean }>): PdfRow[] {
  const total = rows.reduce((s, r) => s + r.durationSeconds, 0) || 1;
  return rows.map((r) => ({
    ...r,
    percent: (r.durationSeconds / total) * 100,
  }));
}

void textWidth;
void COL_WIDTH;
