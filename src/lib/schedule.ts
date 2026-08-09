import { prisma } from "@/lib/db";
import { DayOfWeek, Shift } from "@/generated/prisma/client";
import { addDaysToDateString, dateOnlyFromString, toDateOnlyString } from "@/lib/format";

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function todaySydneyDateString() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
}

export function sydneyNowMinutesOfDay(): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Australia/Sydney",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const hours = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minutes = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hours * 60 + minutes;
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

export type ShiftFilter = Shift | "ALL";

export function parseShiftFilter(value: string | undefined): ShiftFilter {
  if (value === Shift.AM || value === Shift.PM || value === Shift.NIGHT) return value;
  return "ALL";
}

// Inverse of hoursMinutesFromTimeValue — builds a @db.Time value from a
// wall-clock hour/minute pair (same representation prisma/seed.ts's local
// timeOnly() helper uses: a Date anchored at the 1970-01-01 epoch date).
export function timeValueFromHoursMinutes(hours: number, minutes: number): Date {
  return new Date(Date.UTC(1970, 0, 1, hours, minutes, 0));
}

export type ShiftWindowMap = Record<
  Shift,
  { start: [number, number]; finish: [number, number]; breakStart: [number, number] | null }
>;

const SHIFT_ORDER: Shift[] = [Shift.AM, Shift.PM, Shift.NIGHT];

// Settings-backed shift windows (editable at /settings/shifts) — replaces
// the formerly-hardcoded SHIFT_WINDOWS constant. Used when a casual/agency
// employee has no Standard Roster row of their own to source times from,
// and by shiftAwareInstant below for midnight-crossing detection. Fetch
// once per server action/page render and pass the result around rather
// than calling this inside a loop (see lib/actions/board.ts call sites).
export async function getShiftWindows(): Promise<ShiftWindowMap> {
  const rows = await prisma.shiftWindow.findMany();
  const byShift = new Map(rows.map((r) => [r.shift, r]));
  const map = {} as ShiftWindowMap;
  for (const shift of SHIFT_ORDER) {
    const row = byShift.get(shift);
    if (!row) throw new Error(`Missing ShiftWindow row for ${shift} — check migration/seed`);
    const start = hoursMinutesFromTimeValue(row.startTime);
    const finish = hoursMinutesFromTimeValue(row.finishTime);
    const breakStart = row.breakStartTime ? hoursMinutesFromTimeValue(row.breakStartTime) : null;
    map[shift] = {
      start: [start.hours, start.minutes],
      finish: [finish.hours, finish.minutes],
      breakStart: breakStart ? [breakStart.hours, breakStart.minutes] : null,
    };
  }
  return map;
}

// Which shift is live right now, AND which workDate its roster row is
// actually keyed to — used to default the live board to "whatever's
// genuinely live" instead of always AM/today, and to gate live-only
// interactions (drag-and-drop) to the shift that matches. This is more
// than just a time-of-day lookup: a shift whose window crosses midnight
// (start > finish, e.g. NIGHT 22:00-06:00) is still the *same* roster row
// — same workDate — as the evening it started on. At 00:30, "the live
// NIGHT shift" is the one keyed to *yesterday's* workDate (started 22:00
// yesterday, runs to 06:00 today), not a NIGHT shift newly keyed to today
// (which wouldn't start until 22:00 tonight). Same rule plannedWindow uses
// for a shift's own start/finish pair, applied here to "which day did the
// currently-live instance of this shift start on."
// If an admin edits windows in Settings such that two overlap, the first
// match wins (AM, then PM, then NIGHT) — deterministic, not necessarily
// "correct" for an inconsistent config, but that's on the config. Falls
// back to {AM, todayStr} if nothing matches (a gap in the configured
// windows), matching the old hardcoded default.
export function currentShiftAndDateFor(
  windows: ShiftWindowMap,
  todayStr: string,
  minutesOfDay: number
): { shift: Shift; dateStr: string } {
  for (const shift of SHIFT_ORDER) {
    const { start, finish } = windows[shift];
    const startMinutes = start[0] * 60 + start[1];
    const finishMinutes = finish[0] * 60 + finish[1];
    if (startMinutes < finishMinutes) {
      if (minutesOfDay >= startMinutes && minutesOfDay < finishMinutes) return { shift, dateStr: todayStr };
      continue;
    }
    // Crosses midnight: the evening portion (>= start) started today; the
    // early-morning portion (< finish) belongs to the instance that
    // started yesterday.
    if (minutesOfDay >= startMinutes) return { shift, dateStr: todayStr };
    if (minutesOfDay < finishMinutes) return { shift, dateStr: addDaysToDateString(todayStr, -1) };
  }
  return { shift: Shift.AM, dateStr: todayStr };
}

// The shift + workDate whose roster row a movement running past its own
// window's finish would be spilling *from*, for a board being viewed at
// (dateStr, shift) — i.e. one step back around the same AM→PM→NIGHT cycle
// currentShiftAndDateFor walks forward, rolling the date back a day when
// stepping from AM to (yesterday's) NIGHT. Used to find the previous
// shift's overrunning movements so the current shift's board can show its
// slice of them (see BoardContent in src/app/page.tsx).
export function previousShiftAndDate(dateStr: string, shift: Shift): { shift: Shift; dateStr: string } {
  const idx = SHIFT_ORDER.indexOf(shift);
  const prevShift = SHIFT_ORDER[(idx - 1 + SHIFT_ORDER.length) % SHIFT_ORDER.length];
  const prevDateStr = shift === Shift.AM ? addDaysToDateString(dateStr, -1) : dateStr;
  return { shift: prevShift, dateStr: prevDateStr };
}

// Mirror of previousShiftAndDate, stepping the SHIFT_ORDER cycle forward
// instead of back — the shift + workDate a board at (dateStr, shift) should
// look at for an EARLY-starting movement (someone whose own roster row is
// the next shift, but whose recorded startTime is before that shift's own
// window opens). Rolls the date forward a day stepping from NIGHT to
// (tomorrow's) AM.
export function nextShiftAndDate(dateStr: string, shift: Shift): { shift: Shift; dateStr: string } {
  const idx = SHIFT_ORDER.indexOf(shift);
  const nextShift = SHIFT_ORDER[(idx + 1) % SHIFT_ORDER.length];
  const nextDateStr = shift === Shift.NIGHT ? addDaysToDateString(dateStr, 1) : dateStr;
  return { shift: nextShift, dateStr: nextDateStr };
}

// A finish not after the start means the shift crosses midnight.
function finishDateString(dateStr: string, start: [number, number], finish: [number, number]) {
  const startMinutes = start[0] * 60 + start[1];
  const finishMinutes = finish[0] * 60 + finish[1];
  return finishMinutes <= startMinutes ? addDaysToDateString(dateStr, 1) : dateStr;
}

// Resolves an HH:MM a leader types (backdating a move, extending a shift,
// correcting a movement time) against a specific roster row's workDate —
// rolling to the next calendar day whenever the entered time-of-day is
// earlier than that shift's own defined start. The only way to reach an
// hour "before" your own shift start is to have gone all the way round
// past midnight: this is what plannedWindow already does for a shift's own
// start/finish pair (via finishDateString above), generalised to any single
// HH:MM entered against an already-live roster row — needed because NIGHT's
// whole second half sits after midnight, and normal-day shifts like PM can
// still get pushed past midnight by overtime. Bug this fixed: extending a
// PM/NIGHT shift with a time in the small hours ("00:30", "05:00") was
// silently landing on the *same* day as the shift's start — before the
// shift itself had even begun — so the extension read as "in the past" and
// got rejected with no visible error.
export function shiftAwareInstant(
  windows: ShiftWindowMap,
  dateStr: string,
  shift: Shift,
  hours: number,
  minutes: number
): Date {
  const shiftStartMinutes = windows[shift].start[0] * 60 + windows[shift].start[1];
  const targetMinutes = hours * 60 + minutes;
  const targetDateStr = targetMinutes < shiftStartMinutes ? addDaysToDateString(dateStr, 1) : dateStr;
  return sydneyInstant(targetDateStr, hours, minutes);
}

// Parses a native <input type="time"> value ("HH:MM") into an hour/minute
// tuple, validating range.
export function parseTimeString(value: string): [number, number] {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid time: ${value}`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new Error(`Invalid time: ${value}`);
  return [hours, minutes];
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
