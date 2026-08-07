import { prisma } from "@/lib/db";
import { DayOfWeek, Shift } from "@/generated/prisma/client";
import { addDaysToDateString, dateOnlyFromString, toDateOnlyString } from "@/lib/format";

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function todaySydneyDateString() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
}

// Defaults to the most recent work date with a roster so build/view pages
// never open empty in a system where "today" hasn't been generated yet.
export async function resolveWorkDate(requested: string | undefined): Promise<string> {
  if (requested && DATE_RE.test(requested)) return requested;

  const latest = await prisma.dailyRoster.aggregate({ _max: { workDate: true } });
  if (latest._max.workDate) return toDateOnlyString(latest._max.workDate);

  return todaySydneyDateString();
}

const DAY_OF_WEEK_BY_JS_INDEX: DayOfWeek[] = [
  DayOfWeek.SUNDAY,
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
  DayOfWeek.SATURDAY,
];

// dateStr is anchored at UTC midnight (see dateOnlyFromString), so
// getUTCDay() reads back the intended calendar day regardless of host TZ.
export function dayOfWeekForDateString(dateStr: string): DayOfWeek {
  return DAY_OF_WEEK_BY_JS_INDEX[dateOnlyFromString(dateStr).getUTCDay()];
}

// Fixed Sydney standard-time offset (+10:00, no daylight saving) — same
// assumption prisma/seed.ts makes, safe for this app's seeded/demo date
// range.
const SYDNEY_OFFSET = "+10:00";

export function sydneyInstant(dateStr: string, hours: number, minutes: number): Date {
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  return new Date(`${dateStr}T${hh}:${mm}:00${SYDNEY_OFFSET}`);
}

// Extracts the wall-clock hour/minute from a Prisma @db.Time value (a Date
// anchored at the 1970-01-01 epoch date, per Prisma's representation).
export function hoursMinutesFromTimeValue(t: Date): { hours: number; minutes: number } {
  return { hours: t.getUTCHours(), minutes: t.getUTCMinutes() };
}

// Default shift windows, used when a casual/agency employee has no Standard
// Roster row of their own to source times from.
export const SHIFT_WINDOWS: Record<Shift, { start: [number, number]; finish: [number, number] }> = {
  AM: { start: [6, 0], finish: [14, 0] },
  PM: { start: [14, 0], finish: [22, 0] },
  NIGHT: { start: [22, 0], finish: [6, 0] },
};

// A finish not after the start means the shift crosses midnight.
function finishDateString(dateStr: string, start: [number, number], finish: [number, number]) {
  const startMinutes = start[0] * 60 + start[1];
  const finishMinutes = finish[0] * 60 + finish[1];
  return finishMinutes <= startMinutes ? addDaysToDateString(dateStr, 1) : dateStr;
}

// Builds a planned start/finish instant pair from a shift's hour/minute
// window, handling the midnight-crossing case once so callers (standard
// roster generation, casual pool additions) don't duplicate it.
export function plannedWindow(
  dateStr: string,
  start: [number, number],
  finish: [number, number]
): { plannedStart: Date; plannedFinish: Date } {
  const plannedStart = sydneyInstant(dateStr, start[0], start[1]);
  const plannedFinish = sydneyInstant(finishDateString(dateStr, start, finish), finish[0], finish[1]);
  return { plannedStart, plannedFinish };
}
