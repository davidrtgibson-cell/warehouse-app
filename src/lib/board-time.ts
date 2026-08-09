import { fmtTimeSydney } from "@/lib/format";

// Shared duration/range helpers for the live board's "planned hours" model.
//
// A still-open movement's hours are projected through its scheduledFinish,
// never through "now" — ticking against the wall clock made every total
// creep upward all shift and answered the wrong question ("how long has
// this been running") instead of the one leaders actually want ("if
// nothing changes between now and the end of the shift, how many hours
// will this task end up costing against the plan — over or under?"). See
// plannedMinutesOnTask below for the one place this matters.

export function elapsedMinutes(start: Date, end: Date) {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60000));
}

// Projected minutes-on-task for a still-open movement: start through the
// roster's scheduled finish. If scheduledFinish is stale (behind startTime
// — e.g. unapproved overtime, a movement opened after its roster's
// approved finish already passed without the shift being formally
// extended; see TaskMovement notes in the schema), this correctly floors
// at 0: under the plan currently on record, no further hours are
// allocated to this task, which is itself a signal the schedule needs
// extending rather than something to paper over with a live clock.
export function plannedMinutesOnTask(start: Date, scheduledFinish: Date) {
  return elapsedMinutes(start, scheduledFinish);
}

export function formatDuration(totalMinutes: number) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// scheduledFinish can sit behind startTime for a movement opened after its
// roster's approved finish already passed (unapproved overtime) — showing
// that pair as a range would read as a finish time before the start time,
// so fall back to an open-ended "started at" display in that case.
export function formatTimeRange(start: Date, scheduledFinish: Date) {
  const startStr = fmtTimeSydney(start);
  return scheduledFinish.getTime() > start.getTime() ? `${startStr}–${fmtTimeSydney(scheduledFinish)}` : `${startStr}–`;
}
