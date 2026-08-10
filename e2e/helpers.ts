import type { Page } from "@playwright/test";

// Every seeded user shares this password — see the DEV_PASSWORD comment in
// prisma/seed.ts. Names/emails below are deterministic across reseeds
// (unlike employee shift/type assignment, which is randomized per seed).
export const DEV_PASSWORD = "changeme123";
export const ADMIN_EMAIL = "priya.deshmukh@warehouse.test";
export const LEADER_EMAIL = "callum.ferris@warehouse.test";

export async function login(page: Page, email: string, password = DEV_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

// prisma/seed.ts's own WORK_DATE — its DailyRoster/TaskMovement rows are
// pre-seeded directly rather than through the app's Generate/Finalise
// flow, so it's excluded below to keep those flows exercising real work.
const SEED_WORK_DATE = "2026-08-06";

// A weekday date string strictly in the past (so a live-board "move"
// timestamped against it is never rejected as being "in the future" — see
// moveSelectedToTask in src/lib/actions/board.ts), on/after the seeded
// StandardRoster's effectiveFrom (2026-08-03, recurring weekly forever —
// see prisma/seed.ts), and distinct from SEED_WORK_DATE, so its DailyRoster
// starts out empty (no pre-opened TaskMovements) and the Generate/Finalise
// flow has real work to do. "Yesterday" relative to whenever the suite
// runs, nudged backward past any weekend.
export function pastWeekdayDateStr(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6 || d.toISOString().slice(0, 10) === SEED_WORK_DATE) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d.toISOString().slice(0, 10);
}
