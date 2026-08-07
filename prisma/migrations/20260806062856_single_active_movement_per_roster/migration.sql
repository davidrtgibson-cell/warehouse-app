-- Enforce "only one active movement per employee per date/shift" at the
-- database level. Scoped by daily_roster_id, which is already unique per
-- (employee_id, work_date, shift) via daily_rosters' unique constraint, so
-- this transitively scopes by employee + date + shift.
--
-- Prisma's schema language has no syntax for partial/filtered unique
-- indexes, so this is hand-written raw SQL rather than generated from
-- schema.prisma.
CREATE UNIQUE INDEX "task_movements_one_active_per_daily_roster"
  ON "task_movements" ("dailyRosterId")
  WHERE "status" = 'ACTIVE';
