import { describe, expect, it } from "vitest";
import { DEFAULT_ROUNDING, roundDurationSeconds, roundingLabel } from "./rounding";

describe("report duration rounding", () => {
  it("leaves stored duration unchanged when disabled", () => {
    expect(roundDurationSeconds(743, DEFAULT_ROUNDING)).toBe(743);
  });

  it("rounds each entry to the nearest increment", () => {
    const settings = { mode: "nearest" as const, incrementMinutes: 15 as const };
    expect(roundDurationSeconds(7 * 60, settings)).toBe(0);
    expect(roundDurationSeconds(8 * 60, settings)).toBe(15 * 60);
    expect(roundDurationSeconds(22 * 60 + 29, settings)).toBe(15 * 60);
    expect(roundDurationSeconds(22 * 60 + 30, settings)).toBe(30 * 60);
  });

  it("supports deterministic up and down policies", () => {
    expect(roundDurationSeconds(61, { mode: "up", incrementMinutes: 5 })).toBe(5 * 60);
    expect(roundDurationSeconds(9 * 60 + 59, { mode: "down", incrementMinutes: 5 })).toBe(5 * 60);
    expect(roundDurationSeconds(10 * 60, { mode: "up", incrementMinutes: 5 })).toBe(10 * 60);
  });

  it("normalizes invalid and negative durations safely", () => {
    expect(roundDurationSeconds(-50, { mode: "up", incrementMinutes: 15 })).toBe(0);
    expect(roundDurationSeconds(Number.NaN, { mode: "nearest", incrementMinutes: 15 })).toBe(0);
  });

  it("describes the active policy", () => {
    expect(roundingLabel({ mode: "down", incrementMinutes: 6 })).toBe("Round down 6m per entry");
  });
});
