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

/** Minimal single-page text PDF (Helvetica). Local export without a PDF kit. */
export function textToPdf(title: string, lines: string[]): Blob {
  const wrapped: string[] = [title, ""];
  for (const line of lines) {
    if (line.length <= 96) wrapped.push(line);
    else {
      for (let i = 0; i < line.length; i += 96) wrapped.push(line.slice(i, i + 96));
    }
  }

  const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const commands = ["BT", "/F1 11 Tf", "50 780 Td", "14 TL"];
  wrapped.slice(0, 48).forEach((line, i) => {
    commands.push(i === 0 ? `(${escape(line)}) Tj` : `T* (${escape(line)}) Tj`);
  });
  commands.push("ET");
  const stream = commands.join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  const bodyParts = ["%PDF-1.4\n"];
  const offsets = [0];
  let pos = bodyParts[0].length;
  for (let i = 0; i < objects.length; i++) {
    offsets.push(pos);
    const obj = `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
    bodyParts.push(obj);
    pos += obj.length;
  }
  const xrefTable = [
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
  return new Blob([bodyParts.join("") + xrefTable], { type: "application/pdf" });
}
