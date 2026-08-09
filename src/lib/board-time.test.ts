import { describe, expect, it } from "vitest";
import { clampToWindow, elapsedMinutes, formatDuration, formatTimeRange, plannedMinutesOnTask } from "./board-time";

function d(hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 0, 1, h, m));
}

describe("elapsedMinutes", () => {
  it("computes whole minutes between two instants", () => {
    expect(elapsedMinutes(d("06:00"), d("14:00"))).toBe(480);
  });

  it("floors instead of going negative when finish is before start", () => {
    expect(elapsedMinutes(d("14:00"), d("06:00"))).toBe(0);
  });
});

describe("plannedMinutesOnTask", () => {
  it("is an alias for elapsedMinutes against scheduledFinish", () => {
    expect(plannedMinutesOnTask(d("06:00"), d("14:00"))).toBe(480);
  });

  it("floors at 0 when scheduledFinish is stale (behind start)", () => {
    expect(plannedMinutesOnTask(d("14:00"), d("06:00"))).toBe(0);
  });
});

describe("clampToWindow", () => {
  it("returns the full range when it's already inside the window", () => {
    const result = clampToWindow(d("07:00"), d("13:00"), d("06:00"), d("14:00"));
    expect(result).toEqual({ start: d("07:00"), finish: d("13:00") });
  });

  it("clamps both ends when the range spans past the window", () => {
    const result = clampToWindow(d("04:00"), d("16:00"), d("06:00"), d("14:00"));
    expect(result).toEqual({ start: d("06:00"), finish: d("14:00") });
  });

  it("returns null when there's no overlap", () => {
    expect(clampToWindow(d("14:00"), d("16:00"), d("06:00"), d("14:00"))).toBeNull();
  });

  it("returns null for a zero-length overlap at the boundary", () => {
    // finish === windowStart exactly — clampedFinish <= clampedStart
    expect(clampToWindow(d("02:00"), d("06:00"), d("06:00"), d("14:00"))).toBeNull();
  });
});

describe("formatDuration", () => {
  it("formats hours and minutes", () => {
    expect(formatDuration(90)).toBe("1h 30m");
  });

  it("omits the hours part under an hour", () => {
    expect(formatDuration(45)).toBe("45m");
  });

  it("formats an exact hour with 0m", () => {
    expect(formatDuration(120)).toBe("2h 0m");
  });

  it("formats zero as 0m", () => {
    expect(formatDuration(0)).toBe("0m");
  });
});

describe("formatTimeRange", () => {
  // Asserting the exact Sydney-local digits here would mean hand-computing
  // the AEST/AEDT offset for whatever date the test happens to use — the
  // meaningful behaviour to lock down is which of the two branches fires,
  // not the specific clock digits (fmtTimeSydney/format.ts already owns
  // the actual timezone conversion).
  it("formats a normal start–finish range with both times", () => {
    expect(formatTimeRange(d("06:00"), d("14:00"))).toMatch(/^\d{2}:\d{2}–\d{2}:\d{2}$/);
  });

  it("falls back to an open-ended dash when scheduledFinish is behind start (unapproved OT)", () => {
    expect(formatTimeRange(d("14:00"), d("06:00"))).toMatch(/^\d{2}:\d{2}–$/);
  });
});
