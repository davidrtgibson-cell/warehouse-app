// Shared date/time formatting for pages that display roster data.
// Timestamptz columns (real moments in time) are converted to Australia/Sydney
// for display. Date-only columns (@db.Date, stored anchored at UTC midnight —
// see prisma/seed.ts) are formatted/parsed against UTC so they never shift by
// a day when Sydney's offset from UTC is applied.

export function fmtTimeSydney(d: Date) {
  return d.toLocaleTimeString("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Australia/Sydney",
  });
}

export function fmtWorkDate(d: Date) {
  return d.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function toDateOnlyString(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function dateOnlyFromString(s: string) {
  return new Date(`${s}T00:00:00.000Z`);
}

export function addDaysToDateString(s: string, days: number) {
  const d = dateOnlyFromString(s);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateOnlyString(d);
}
