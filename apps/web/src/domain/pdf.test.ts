import { describe, expect, it } from "vitest";
import { buildSummaryPdf, buildTimeSummaryPdf, withPercents } from "./reports";

describe("summary PDF export", () => {
  it("builds a multi-page PDF matching the report layout shape", async () => {
    const many = Array.from({ length: 80 }, (_, i) => ({
      label: `Entry line ${i + 1} with a longer description for wrapping`,
      durationSeconds: 3600 + i * 60,
    }));
    const blob = buildSummaryPdf({
      title: "Summary report",
      rangeLabel: "23/06/2026 - 22/07/2026",
      totalSeconds: 7200,
      sections: [
        { heading: "Project", rows: withPercents(many.slice(0, 10)) },
        { heading: "Description", rows: withPercents(many) },
        {
          heading: "Project / Description Duration",
          rows: [
            { label: "Mobile App v2", durationSeconds: 7200 },
            { label: "Checkout", durationSeconds: 3600, indent: true },
            { label: "QA pass", durationSeconds: 3600, indent: true },
          ],
        },
      ],
      workspaceName: "Northwind Studio",
    });
    expect(blob.type).toBe("application/pdf");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const text = new TextDecoder("latin1").decode(bytes);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("Summary report");
    expect(text).toContain("Created with Clockinator");
    expect(text).toContain("Northwind Studio");
    // more than one page content stream for long description list
    expect((text.match(/\/Type \/Page /g) ?? []).length).toBeGreaterThan(1);
  });

  it("buildTimeSummaryPdf includes project and description sections", async () => {
    const blob = buildTimeSummaryPdf({
      from: new Date(2026, 5, 23),
      toExclusive: new Date(2026, 6, 23),
      totalSeconds: 3661,
      byProject: [{ title: "Discord Meeting", seconds: 3661 }],
      byDescription: [{ title: "Mod Meeting", seconds: 3661 }],
      nested: [
        {
          project: "Discord Meeting",
          seconds: 3661,
          children: [{ title: "Mod Meeting", seconds: 3661 }],
        },
      ],
      workspaceName: "Northwind Studio",
    });
    const text = new TextDecoder("latin1").decode(await blob.arrayBuffer());
    expect(text).toContain("Project");
    expect(text).toContain("Description");
    expect(text).toContain("23/06/2026");
  });
});
