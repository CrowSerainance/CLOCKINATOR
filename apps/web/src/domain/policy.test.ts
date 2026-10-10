import { describe, expect, it } from "vitest";
import {
  attendanceStatus,
  convertFromBase,
  entryPolicyErrors,
  forecastUtilization,
  isWeekendKey,
  parseTimesheetCsv,
  roundSeconds,
} from "./policy";

describe("offline policy", () => {
  it("rounds durations to a minute grid", () => {
    expect(roundSeconds(7 * 60 + 20, 0, "nearest")).toBe(440);
    expect(roundSeconds(7 * 60 + 20, 15, "nearest")).toBe(0);
    expect(roundSeconds(8 * 60, 15, "nearest")).toBe(15 * 60);
    expect(roundSeconds(7 * 60, 15, "up")).toBe(15 * 60);
    expect(roundSeconds(14 * 60, 15, "down")).toBe(0);
    expect(roundSeconds(20 * 60, 6, "up")).toBe(24 * 60);
  });

  it("lists missing required fields", () => {
    const errors = entryPolicyErrors(
      {
        requireDescription: true,
        requireProject: true,
        requireTask: false,
        requireTag: true,
        requiredCustom: [{ fieldId: "f1", name: "Ticket" }],
      },
      { description: "No description", projectId: null, taskId: null, tagIds: [], customFields: [{ fieldId: "f1", value: " " }] },
    );
    expect(errors).toEqual(["Description is required", "Project is required", "A tag is required", "Ticket is required"]);
  });

  it("parses a timesheet CSV and rejects a bad row", () => {
    const parsed = parseTimesheetCsv(`date,start,end,description,project,tags,billable
2026-08-18,09:00,11:30,Design review,Mobile App v2,Design|Review,yes
bad,9am,10:00,Nope,Mobile,,no`);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({
      date: "2026-08-18",
      description: "Design review",
      project: "Mobile App v2",
      tags: ["Design", "Review"],
      billable: true,
    });
    expect(parsed.errors[0]).toMatch(/Row 3/);
  });

  it("compares scheduled hours with capacity and converts currency", () => {
    expect(forecastUtilization(32, 40)).toBeCloseTo(0.8);
    expect(forecastUtilization(10, 0)).toBe(0);
    expect(convertFromBase(160, 1.08)).toBeCloseTo(160 / 1.08);
    expect(convertFromBase(160, 1)).toBe(160);
  });

  it("marks attendance and weekends", () => {
    expect(attendanceStatus(3600, false)).toBe("present");
    expect(attendanceStatus(0, true)).toBe("off");
    expect(attendanceStatus(0, false)).toBe("absent");
    expect(isWeekendKey("2026-08-16")).toBe(true);
    expect(isWeekendKey("2026-08-17")).toBe(false);
  });
});