-- Backfills the 3 canonical ShiftWindow rows (AM/PM/NIGHT) that every
-- environment is expected to have exactly one of each — see the "Missing
-- ShiftWindow row" throw in getShiftWindows() (src/lib/schedule.ts).
--
-- Nothing before this migration ever created these rows outside of
-- prisma/seed.ts, which is dev/demo-only and deliberately never run in
-- production (DEPLOY.md only runs `prisma migrate deploy`). A fresh
-- production database therefore started with an empty shift_windows table,
-- and every page that calls getShiftWindows() unconditionally (Live board,
-- Reports on first visit, Build roster with no ?date= yet) crashed with an
-- uncaught server error. Settings > Shift hours didn't surface this clearly
-- either — it renders fine with a 00:00 placeholder when a row is missing,
-- but updateShiftWindowAction (lib/actions/settings.ts) is update-only, so
-- saving there was silently impossible too, with no row to update.
--
-- ON CONFLICT DO NOTHING makes this safe to run against a database that
-- already has these rows (e.g. anywhere prisma/seed.ts has already run) —
-- it only fills in what's actually missing, and never overwrites hours an
-- admin has already configured through Settings > Shift hours.
INSERT INTO "shift_windows" ("id", "shift", "startTime", "finishTime", "updatedAt")
VALUES
  ('shift-window-am', 'AM', '06:00:00', '14:00:00', CURRENT_TIMESTAMP),
  ('shift-window-pm', 'PM', '14:00:00', '22:00:00', CURRENT_TIMESTAMP),
  ('shift-window-night', 'NIGHT', '22:00:00', '06:00:00', CURRENT_TIMESTAMP)
ON CONFLICT ("shift") DO NOTHING;
