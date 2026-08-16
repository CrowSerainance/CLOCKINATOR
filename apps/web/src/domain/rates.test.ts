import { describe, expect, it } from "vitest";
import { historicRateAt, pickBillableRate } from "./rates";

describe("pickBillableRate", () => {
  it("uses task then project then workspace", () => {
    expect(pickBillableRate({ task: "175.00", project: "160.00", workspace: "25.00" })).toBe("175.00");
    expect(pickBillableRate({ task: null, project: "160.00", workspace: "25.00" })).toBe("160.00");
    expect(pickBillableRate({ task: null, project: null, workspace: "25.00" })).toBe("25.00");
  });
});

describe("historicRateAt", () => {
  const rows = [
    {
      subject_type: "project" as const,
      subject_id: "proj_a",
      rate_kind: "billable" as const,
      amount: "100.00",
      effective_from: "2026-01-01T00:00:00.000Z",
      effective_to: "2026-06-01T00:00:00.000Z",
    },
    {
      subject_type: "project" as const,
      subject_id: "proj_a",
      rate_kind: "billable" as const,
      amount: "140.00",
      effective_from: "2026-06-01T00:00:00.000Z",
      effective_to: null,
    },
  ];

  it("returns the covering historic row", () => {
    expect(
      historicRateAt(rows, "billable", "2026-03-01T00:00:00.000Z", [{ type: "project", id: "proj_a" }]),
    ).toBe("100.00");
    expect(
      historicRateAt(rows, "billable", "2026-07-01T00:00:00.000Z", [{ type: "project", id: "proj_a" }]),
    ).toBe("140.00");
  });
});
