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
const MARGIN_X = 48;
const MARGIN_TOP = 56;
const MARGIN_BOTTOM = 48;
const CONTENT_RIGHT = PAGE_W - MARGIN_X;
const CONTENT_WIDTH = CONTENT_RIGHT - MARGIN_X;

/** Clockinator accent (print-safe). */
const ACCENT = { r: 0.357, g: 0.741, b: 0.494 }; // #5bbd7e
const INK = { r: 0.12, g: 0.11, b: 0.1 };
const MUTED = { r: 0.45, g: 0.43, b: 0.4 };
const RULE = { r: 0.86, g: 0.84, b: 0.81 };
const ZEBRA = { r: 0.965, g: 0.96, b: 0.95 };

const COL_AMOUNT_R = CONTENT_RIGHT;
const COL_PERCENT_R = CONTENT_RIGHT - 78;
const COL_DURATION_R = CONTENT_RIGHT - 148;
const COL_LABEL_R = COL_DURATION_R - 16;

type FontId = "F1" | "F2"; // Helvetica / Helvetica-Bold

type DrawOp =
  | { kind: "rect"; x: number; y: number; w: number; h: number; fill: { r: number; g: number; b: number } }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number; stroke: { r: number; g: number; b: number }; width?: number }
  | {
      kind: "text";
      x: number;
      y: number;
      text: string;
      size: number;
      font: FontId;
      color: { r: number; g: number; b: number };
      align?: "left" | "right";
    };

function escapePdf(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** Approximate Helvetica advance widths (ASCII). Good enough for clipping + right-align. */
function textWidth(text: string, fontSize: number, bold = false): number {
  const factor = bold ? 0.55 : 0.5;
  let w = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code < 32) continue;
    if (ch === "i" || ch === "l" || ch === "t" || ch === "f" || ch === "j" || ch === "I" || ch === " ") w += 0.28;
    else if (ch === "m" || ch === "w" || ch === "M" || ch === "W") w += 0.78;
    else w += factor;
  }
  return w * fontSize;
}

function formatPercent(n: number): string {
  return `${n.toFixed(2).replace(".", ",")}%`;
}

function clipLabel(label: string, maxWidth: number, fontSize: number, bold = false): string {
  if (textWidth(label, fontSize, bold) <= maxWidth) return label;
  const ell = "…";
  let lo = 0;
  let hi = label.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = label.slice(0, mid) + ell;
    if (textWidth(candidate, fontSize, bold) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return label.slice(0, Math.max(1, lo)) + ell;
}

function opsToStream(ops: DrawOp[]): string {
  const cmds: string[] = [];
  for (const op of ops) {
    if (op.kind === "rect") {
      cmds.push(`${op.fill.r} ${op.fill.g} ${op.fill.b} rg`);
      cmds.push(`${op.x.toFixed(2)} ${op.y.toFixed(2)} ${op.w.toFixed(2)} ${op.h.toFixed(2)} re f`);
    } else if (op.kind === "line") {
      cmds.push(`${op.stroke.r} ${op.stroke.g} ${op.stroke.b} RG`);
      cmds.push(`${op.width ?? 0.6} w`);
      cmds.push(`${op.x1.toFixed(2)} ${op.y1.toFixed(2)} m ${op.x2.toFixed(2)} ${op.y2.toFixed(2)} l S`);
    } else {
      const x =
        op.align === "right" ? op.x - textWidth(op.text, op.size, op.font === "F2") : op.x;
      cmds.push("BT");
      cmds.push(`/${op.font} ${op.size} Tf`);
      cmds.push(`${op.color.r} ${op.color.g} ${op.color.b} rg`);
      cmds.push(`1 0 0 1 ${x.toFixed(2)} ${op.y.toFixed(2)} Tm`);
      cmds.push(`(${escapePdf(op.text)}) Tj`);
      cmds.push("ET");
    }
  }
  return cmds.join("\n");
}

function sectionHasAmounts(rows: PdfRow[]): boolean {
  return rows.some((r) => Boolean(r.amount));
}

function sectionHasPercents(rows: PdfRow[]): boolean {
  return rows.some((r) => r.percent != null);
}

/**
 * Multi-page summary PDF: Clockify-shaped structure with Clockinator visual polish —
 * accent bar, bold headings, column headers, zebra rows, aligned Duration / Share / Amount.
 */
export function buildSummaryPdf(input: SummaryPdfInput): Blob {
  const brand = input.brandLine ?? "Created with Clockinator";
  const pages: DrawOp[][] = [];
  let ops: DrawOp[] = [];
  let y = PAGE_H - MARGIN_TOP;

  const flushPage = () => {
    // Footer rule + text
    ops.push({ kind: "line", x1: MARGIN_X, y1: 36, x2: CONTENT_RIGHT, y2: 36, stroke: RULE, width: 0.5 });
    ops.push({
      kind: "text",
      x: MARGIN_X,
      y: 22,
      text: `${input.workspaceName}  ·  ${brand}`,
      size: 8,
      font: "F1",
      color: MUTED,
    });
    ops.push({
      kind: "text",
      x: CONTENT_RIGHT,
      y: 22,
      text: `${pages.length + 1}`,
      size: 8,
      font: "F1",
      color: MUTED,
      align: "right",
    });
    pages.push(ops);
    ops = [];
    y = PAGE_H - MARGIN_TOP;
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN_BOTTOM) flushPage();
  };

  // Top accent bar
  ops.push({ kind: "rect", x: 0, y: PAGE_H - 8, w: PAGE_W, h: 8, fill: ACCENT });

  // Title block
  ops.push({ kind: "text", x: MARGIN_X, y: y - 4, text: input.title, size: 20, font: "F2", color: INK });
  y -= 28;
  ops.push({ kind: "text", x: MARGIN_X, y: y, text: input.rangeLabel, size: 11, font: "F1", color: MUTED });
  y -= 18;
  ops.push({
    kind: "text",
    x: MARGIN_X,
    y: y,
    text: `Total: ${formatDuration(Math.max(0, Math.round(input.totalSeconds)))}`,
    size: 12,
    font: "F2",
    color: INK,
  });
  y -= 16;
  if (input.subtitle) {
    ops.push({ kind: "text", x: MARGIN_X, y: y, text: input.subtitle, size: 10, font: "F1", color: MUTED });
    y -= 14;
  }
  y -= 8;
  ops.push({ kind: "line", x1: MARGIN_X, y1: y, x2: CONTENT_RIGHT, y2: y, stroke: RULE, width: 0.8 });
  y -= 20;

  for (const section of input.sections) {
    const showPct = sectionHasPercents(section.rows);
    const showAmt = sectionHasAmounts(section.rows);
    const rowH = 18;
    const headerBlock = 34;

    ensureSpace(headerBlock + rowH * Math.min(2, Math.max(1, section.rows.length)));

    // Section heading with accent tick
    ops.push({ kind: "rect", x: MARGIN_X, y: y - 2, w: 3, h: 12, fill: ACCENT });
    ops.push({
      kind: "text",
      x: MARGIN_X + 10,
      y: y,
      text: section.heading,
      size: 12,
      font: "F2",
      color: INK,
    });
    y -= 16;
    ops.push({ kind: "line", x1: MARGIN_X, y1: y, x2: CONTENT_RIGHT, y2: y, stroke: RULE, width: 0.5 });
    y -= 14;

    // Column headers
    ops.push({ kind: "text", x: MARGIN_X, y: y, text: "Name", size: 8, font: "F2", color: MUTED });
    ops.push({
      kind: "text",
      x: COL_DURATION_R,
      y: y,
      text: "Duration",
      size: 8,
      font: "F2",
      color: MUTED,
      align: "right",
    });
    if (showPct) {
      ops.push({
        kind: "text",
        x: COL_PERCENT_R,
        y: y,
        text: "Share",
        size: 8,
        font: "F2",
        color: MUTED,
        align: "right",
      });
    }
    if (showAmt) {
      ops.push({
        kind: "text",
        x: COL_AMOUNT_R,
        y: y,
        text: "Amount",
        size: 8,
        font: "F2",
        color: MUTED,
        align: "right",
      });
    }
    y -= 6;
    ops.push({ kind: "line", x1: MARGIN_X, y1: y, x2: CONTENT_RIGHT, y2: y, stroke: RULE, width: 0.4 });
    y -= 4;

    if (section.rows.length === 0) {
      ensureSpace(rowH);
      ops.push({ kind: "text", x: MARGIN_X + 4, y: y - 12, text: "(none)", size: 10, font: "F1", color: MUTED });
      y -= rowH + 10;
      continue;
    }

    section.rows.forEach((row, index) => {
      ensureSpace(rowH + 2);
      const rowTop = y;
      const rowBottom = y - rowH;
      const textY = rowBottom + 5;

      if (index % 2 === 0) {
        ops.push({
          kind: "rect",
          x: MARGIN_X,
          y: rowBottom,
          w: CONTENT_WIDTH,
          h: rowH,
          fill: ZEBRA,
        });
      }

      const indent = row.indent ? 14 : 0;
      const labelMax = COL_LABEL_R - MARGIN_X - indent - 4;
      const label = clipLabel((row.indent ? "" : "") + row.label, labelMax, 10, !row.indent && !row.percent);
      ops.push({
        kind: "text",
        x: MARGIN_X + indent,
        y: textY,
        text: label,
        size: 10,
        font: row.indent ? "F1" : "F1",
        color: row.indent ? MUTED : INK,
      });

      const dur = formatDuration(Math.max(0, Math.round(row.durationSeconds)));
      ops.push({
        kind: "text",
        x: COL_DURATION_R,
        y: textY,
        text: dur,
        size: 10,
        font: "F1",
        color: INK,
        align: "right",
      });

      if (showPct && row.percent != null) {
        ops.push({
          kind: "text",
          x: COL_PERCENT_R,
          y: textY,
          text: formatPercent(row.percent),
          size: 10,
          font: "F1",
          color: MUTED,
          align: "right",
        });
      }

      if (showAmt && row.amount) {
        ops.push({
          kind: "text",
          x: COL_AMOUNT_R,
          y: textY,
          text: row.amount,
          size: 10,
          font: "F1",
          color: INK,
          align: "right",
        });
      }

      y = rowTop - rowH;
      void rowBottom;
    });

    y -= 16;
  }

  if (ops.length) flushPage();
  if (pages.length === 0) {
    ops = [
      { kind: "rect", x: 0, y: PAGE_H - 8, w: PAGE_W, h: 8, fill: ACCENT },
      { kind: "text", x: MARGIN_X, y: PAGE_H - 60, text: input.title, size: 20, font: "F2", color: INK },
    ];
    flushPage();
  }

  return assemblePdf(pages.map(opsToStream));
}

function assemblePdf(contentStreams: string[]): Blob {
  const objects: string[] = [];
  const pageCount = contentStreams.length;
  const pageObjIds = contentStreams.map((_, i) => 3 + i);
  const contentObjIds = contentStreams.map((_, i) => 3 + pageCount + i);
  const fontRegularId = 3 + pageCount * 2;
  const fontBoldId = fontRegularId + 1;

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(
    `<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageCount} >>`,
  );

  for (let i = 0; i < pageCount; i++) {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentObjIds[i]} 0 R /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> >>`,
    );
  }
  for (const stream of contentStreams) {
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

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

export function withPercents(
  rows: Array<{ label: string; durationSeconds: number; amount?: string; indent?: boolean }>,
): PdfRow[] {
  const total = rows.reduce((s, r) => s + r.durationSeconds, 0) || 1;
  return rows.map((r) => ({
    ...r,
    percent: (r.durationSeconds / total) * 100,
  }));
}
