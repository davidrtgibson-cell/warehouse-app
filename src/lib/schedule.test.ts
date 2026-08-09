import { describe, expect, it } from "vitest";
import {
  DATE_RE,
  currentShiftAndDateFor,
  dayOfWeekForDateString,
  hoursMinutesFromTimeValue,
  nextShiftAndDate,
  parseShiftFilter,
  parseTimeString,
  plannedWindow,
  previousShiftAndDate,
  shiftAwareInstant,
  sydneyInstant,
  timeValueFromHoursMinutes,
  type ShiftWindowMap,
} from "./schedule";
import { Shift, DayOfWeek } from "@/generated/prisma/enums";

// AM/PM don't cross midnight; NIGHT does (22:00 → 06:00) — matches the
// seeded defaults in prisma/seed.ts, exercising the midnight-crossing path
// that's the whole reason several of these functions exist.
const WINDOWS: ShiftWindowMap = {
  AM: { start: [6, 0], finish: [14, 0], breakStart: [11, 0] },
  PM: { start: [14, 0], finish: [22, 0], breakStart: [19, 0] },
  NIGHT: { start: [22, 0], finish: [6, 0], breakStart: [2, 0] },
};

describe("DATE_RE", () => {
  it("matches YYYY-MM-DD", () => {
    expect(DATE_RE.test("2026-08-10")).toBe(true);
  });

  it("rejects other shapes", () => {
    expect(DATE_RE.test("10-08-2026")).toBe(false);
    expect(DATE_RE.test("2026-8-10")).toBe(false);
    expect(DATE_RE.test("not a date")).toBe(false);
  });
});

describe("dayOfWeekForDateString", () => {
  it("resolves the correct calendar day regardless of host TZ (anchored at UTC midnight)", () => {
    // 2026-08-10 is a Monday.
    expect(dayOfWeekForDateString("2026-08-10")).toBe(DayOfWeek.MONDAY);
    expect(dayOfWeekForDateString("2026-08-16")).toBe(DayOfWeek.SUNDAY);
  });
});

describe("sydneyInstant / hoursMinutesFromTimeValue / timeValueFromHoursMinutes", () => {
  it("round-trips hours/minutes through the @db.Time representation", () => {
    const t = timeValueFromHoursMinutes(13, 45);
    expect(hoursMinutesFromTimeValue(t)).toEqual({ hours: 13, minutes: 45 });
  });

  it("builds a real Date instant from a date string + Sydney wall-clock time", () => {
    const instant = sydneyInstant("2026-08-10", 6, 0);
    expect(instant instanceof Date).toBe(true);
    expect(Number.isNaN(instant.getTime())).toBe(false);
  });
});

describe("parseShiftFilter", () => {
  it("accepts valid shift values", () => {
    expect(parseShiftFilter("AM")).toBe("AM");
    expect(parseShiftFilter("NIGHT")).toBe("NIGHT");
  });

  it("falls back to ALL for anything else", () => {
    expect(parseShiftFilter(undefined)).toBe("ALL");
    expect(parseShiftFilter("bogus")).toBe("ALL");
  });
});

describe("parseTimeString", () => {
  it("parses a valid HH:MM", () => {
    expect(parseTimeString("06:30")).toEqual([6, 30]);
  });

  it("rejects an out-of-range hour or minute", () => {
    expect(() => parseTimeString("24:00")).toThrow();
    expect(() => parseTimeString("10:60")).toThrow();
  });

  it("rejects a malformed string", () => {
    expect(() => parseTimeString("not a time")).toThrow();
  });
});

describe("currentShiftAndDateFor", () => {
  it("resolves a non-crossing shift (AM) to today", () => {
    // 08:00 = 480 minutes of day, inside AM's 06:00-14:00.
    expect(currentShiftAndDateFor(WINDOWS, "2026-08-10", 8 * 60)).toEqual({ shift: Shift.AM, dateStr: "2026-08-10" });
  });

  it("resolves the evening portion of a midnight-crossing shift (NIGHT) to today", () => {
    // 23:00 — NIGHT started today (22:00) and runs past midnight.
    expect(currentShiftAndDateFor(WINDOWS, "2026-08-10", 23 * 60)).toEqual({
      shift: Shift.NIGHT,
      dateStr: "2026-08-10",
    });
  });

  it("resolves the early-morning portion of a midnight-crossing shift (NIGHT) to yesterday", () => {
    // 02:00 — this is still the NIGHT shift that started yesterday at 22:00.
    expect(currentShiftAndDateFor(WINDOWS, "2026-08-10", 2 * 60)).toEqual({
      shift: Shift.NIGHT,
      dateStr: "2026-08-09",
    });
  });

  it("falls back to AM/today for a gap not covered by any window", () => {
    const gappyWindows: ShiftWindowMap = {
      AM: { start: [8, 0], finish: [10, 0], breakStart: null },
      PM: { start: [12, 0], finish: [14, 0], breakStart: null },
      NIGHT: { start: [16, 0], finish: [18, 0], breakStart: null },
    };
    // 11:00 falls in none of the three narrow windows above.
    expect(currentShiftAndDateFor(gappyWindows, "2026-08-10", 11 * 60)).toEqual({
      shift: Shift.AM,
      dateStr: "2026-08-10",
    });
  });
});

describe("previousShiftAndDate / nextShiftAndDate", () => {
  it("steps backward within a day (PM -> AM, same date)", () => {
    expect(previousShiftAndDate("2026-08-10", Shift.PM)).toEqual({ shift: Shift.AM, dateStr: "2026-08-10" });
  });

  it("rolls the date back a day stepping from AM to (yesterday's) NIGHT", () => {
    expect(previousShiftAndDate("2026-08-10", Shift.AM)).toEqual({ shift: Shift.NIGHT, dateStr: "2026-08-09" });
  });

  it("steps forward within a day (AM -> PM, same date)", () => {
    expect(nextShiftAndDate("2026-08-10", Shift.AM)).toEqual({ shift: Shift.PM, dateStr: "2026-08-10" });
  });

  it("rolls the date forward a day stepping from NIGHT to (tomorrow's) AM", () => {
    expect(nextShiftAndDate("2026-08-10", Shift.NIGHT)).toEqual({ shift: Shift.AM, dateStr: "2026-08-11" });
  });
});

describe("shiftAwareInstant", () => {
  it("keeps a time at/after the shift's own start on the same date", () => {
    // NIGHT starts at 22:00 — 23:30 is later the same evening.
    const instant = shiftAwareInstant(WINDOWS, "2026-08-10", Shift.NIGHT, 23, 30);
    const sameDayInstant = sydneyInstant("2026-08-10", 23, 30);
    expect(instant.getTime()).toBe(sameDayInstant.getTime());
  });

  it("rolls a time before the shift's own start to the next day (past-midnight NIGHT hours)", () => {
    // NIGHT starts at 22:00 — 02:00 is only reachable by having gone past midnight.
    const instant = shiftAwareInstant(WINDOWS, "2026-08-10", Shift.NIGHT, 2, 0);
    const nextDayInstant = sydneyInstant("2026-08-11", 2, 0);
    expect(instant.getTime()).toBe(nextDayInstant.getTime());
  });
});

describe("plannedWindow", () => {
  it("keeps a non-crossing shift's start and finish on the same date", () => {
    const { plannedStart, plannedFinish } = plannedWindow("2026-08-10", [6, 0], [14, 0]);
    expect(plannedStart.getTime()).toBe(sydneyInstant("2026-08-10", 6, 0).getTime());
    expect(plannedFinish.getTime()).toBe(sydneyInstant("2026-08-10", 14, 0).getTime());
  });

  it("rolls a midnight-crossing shift's finish to the next date", () => {
    const { plannedStart, plannedFinish } = plannedWindow("2026-08-10", [22, 0], [6, 0]);
    expect(plannedStart.getTime()).toBe(sydneyInstant("2026-08-10", 22, 0).getTime());
    expect(plannedFinish.getTime()).toBe(sydneyInstant("2026-08-11", 6, 0).getTime());
  });
});
