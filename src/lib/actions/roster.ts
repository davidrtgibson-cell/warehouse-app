"use server";

import { refresh } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCurrentUser } from "@/lib/auth";
import { standardRosterEligibilityWhere } from "@/lib/roster-queries";
import {
  DATE_RE,
  dayOfWeekForDateString,
  getShiftWindows,
  parseTimeString,
  plannedWindow,
  hoursMinutesFromTimeValue,
  shiftAwareInstant,
  sydneyInstant,
} from "@/lib/schedule";
import { dateOnlyFromString, toDateOnlyString } from "@/lib/format";
import { closeActiveMovement, openMovement } from "@/lib/movement-core";
import {
  MovementStatus,
  Prisma,
  RosterSource,
  RosterStatus,
  Shift,
  TaskCategory,
} from "@/generated/prisma/client";

type TxClient = Prisma.TransactionClient;

// ---------------------------------------------------------------------------
// Generate from Standard Roster
// ---------------------------------------------------------------------------

export async function generateDailyRosterFromStandard(dateStr: string) {
  if (!DATE_RE.test(dateStr)) throw new Error("Invalid date");
  const actingUser = await requireCurrentUser();

  const workDate = dateOnlyFromString(dateStr);
  const dayOfWeek = dayOfWeekForDateString(dateStr);

  const standardRosters = await prisma.standardRoster.findMany({
    where: standardRosterEligibilityWhere(dayOfWeek, workDate),
  });

  const existing = await prisma.dailyRoster.findMany({
    where: { workDate },
    select: { employeeId: true, shift: true },
  });
  const existingKeys = new Set(existing.map((e) => `${e.employeeId}:${e.shift}`));

  const rowsToCreate = standardRosters
    .filter((sr) => !existingKeys.has(`${sr.employeeId}:${sr.shift}`))
    .map((sr) => {
      const start = hoursMinutesFromTimeValue(sr.startTime);
      const finish = hoursMinutesFromTimeValue(sr.finishTime);
      const { plannedStart, plannedFinish } = plannedWindow(
        dateStr,
        [start.hours, start.minutes],
        [finish.hours, finish.minutes]
      );
      return {
        employeeId: sr.employeeId,
        workDate,
        shift: sr.shift,
        plannedStart,
        plannedFinish,
        approvedFinish: plannedFinish,
        defaultTaskId: sr.defaultTaskId,
        rosterStatus: RosterStatus.PLANNED,
        rosterSource: RosterSource.STANDARD_ROSTER,
        standardRosterId: sr.id,
      };
    });

  const result =
    rowsToCreate.length > 0
      ? await prisma.dailyRoster.createMany({ data: rowsToCreate, skipDuplicates: true })
      : { count: 0 };

  await prisma.auditLog.create({
    data: {
      entityType: "DailyRoster",
      entityId: dateStr,
      action: "GENERATE_FROM_STANDARD_ROSTER",
      changes: {
        workDate: dateStr,
        matched: standardRosters.length,
        created: result.count,
        skippedExisting: standardRosters.length - rowsToCreate.length,
      },
      changedByUserId: actingUser.id,
    },
  });

  refresh();
  return { created: result.count };
}

// ---------------------------------------------------------------------------
// Finalise roster — bulk-opens an ACTIVE movement (on the default task,
// starting at plannedStart) for every PLANNED row on a date/shift that
// doesn't have one yet, and marks the date/shift as live for the board.
// Not a lock: safe to call again later (e.g. after adding casual staff) —
// rows that already have an active movement are left alone.
// ---------------------------------------------------------------------------

export async function finalizeRosterAction(dateStr: string, shift: Shift) {
  if (!DATE_RE.test(dateStr)) throw new Error("Invalid date");
  const actingUser = await requireCurrentUser();
  const workDate = dateOnlyFromString(dateStr);

  const rows = await prisma.dailyRoster.findMany({
    where: { workDate, shift, rosterStatus: RosterStatus.PLANNED },
  });

  const alreadyActive = await prisma.taskMovement.findMany({
    where: { dailyRosterId: { in: rows.map((r) => r.id) }, status: MovementStatus.ACTIVE },
    select: { dailyRosterId: true },
  });
  const activeIds = new Set(alreadyActive.map((m) => m.dailyRosterId));
  const toStart = rows.filter((r) => !activeIds.has(r.id));

  const tasks = await prisma.task.findMany({
    where: { id: { in: Array.from(new Set(toStart.map((r) => r.defaultTaskId))) } },
  });
  const taskById = new Map(tasks.map((t) => [t.id, t]));

  await prisma.$transaction(
    async (tx) => {
      for (const row of toStart) {
        const task = taskById.get(row.defaultTaskId);
        if (!task) continue;
        await openMovement(tx, row, task, actingUser.id, "FINALIZE_ROSTER", row.plannedStart);
      }

      await tx.rosterFinalization.upsert({
        where: { workDate_shift: { workDate, shift } },
        create: { workDate, shift, finalizedByUserId: actingUser.id },
        update: { finalizedAt: new Date(), finalizedByUserId: actingUser.id },
      });
    },
    // A whole shift can be 100+ rows — well past Prisma's 5s default.
    { timeout: 30_000 }
  );

  refresh();
  return { started: toStart.length };
}

// ---------------------------------------------------------------------------
// Bulk change start and/or finish time — the "bring several people on
// earlier, or extend several at once, or fix it after the fact" tool, next
// to "Mark selected absent" on the Build Roster screen. Start and finish
// are each independently optional: fill in just start (a pre-shift-OT
// early start), just finish (the "Extend Shift" case, bulked), or both.
//
// `mode` also sets DailyRoster.shiftExtended (true for OVERTIME, false for
// SHIFT_CHANGE) — the same flag extendShiftAction sets. The live board
// gates its "OT · from/into <shift>" spillover badge on this flag rather
// than on simply crossing a shift-window boundary, since an ad-hoc
// custom-hours row (e.g. from the casual pool, or a deliberate shift
// move) can legitimately span two shifts by design without being
// overtime — see BoardContent in src/app/page.tsx.
//
// `mode` also decides what happens on the field you leave BLANK, and only
// when the row isn't yet a "live fact" (see below for why):
//   OVERTIME     — the blank field stays exactly where it was, so the
//                  shift simply gets longer/shorter (the "extra hours"
//                  case).
//   SHIFT_CHANGE — the blank field moves by the same delta as the one you
//                  set, preserving the row's original shift length (a
//                  moved window, not added hours).
//
// A row with no ACTIVE movement yet always edits the plan — plannedStart/
// plannedFinish/approvedFinish, same as updateRosterTimesAction. A row
// that DOES have one gets corrected through the movement's own startTime/
// scheduledFinish instead (that's what the board actually reads once one
// exists) — but Finalise Roster can be run ahead of a shift's own start
// (or the whole workDate can be a future date being planned in advance),
// so "has a movement" isn't the same as "has genuinely started": whether
// this counts as an already-happened fact — no drag, can't move into the
// future, can't overlap an earlier movement — is decided by whether that
// movement's startTime has actually passed yet, not just by whether it
// exists. Dragging or backdating a real fact would risk silently
// rewriting when someone actually started; that only makes sense for a
// plan that hasn't happened yet, whether or not it's technically
// "finalised."
//
// This is always a one-off, today-only edit — it never touches Standard
// Roster. Rows that are no longer PLANNED, an already-happened row whose
// new start would be in the future or would overlap an earlier movement
// that day, or any row where the resulting finish wouldn't be after the
// start, are silently skipped rather than failing the whole selection —
// same convention as every other bulk action here.
// ---------------------------------------------------------------------------

export type BulkChangeStartTimeMode = "OVERTIME" | "SHIFT_CHANGE";

export async function bulkChangeStartTimeAction(
  dailyRosterIds: string[],
  newStartTimeStr: string | undefined,
  newFinishTimeStr: string | undefined,
  mode: BulkChangeStartTimeMode,
  note?: string
) {
  if (dailyRosterIds.length === 0) throw new Error("No rows selected");
  if (!newStartTimeStr && !newFinishTimeStr) throw new Error("Enter a start time, a finish time, or both");
  const actingUser = await requireCurrentUser();
  const start = newStartTimeStr ? parseTimeString(newStartTimeStr) : null;
  const finish = newFinishTimeStr ? parseTimeString(newFinishTimeStr) : null;
  const shiftWindows = finish ? await getShiftWindows() : null;

  const dailyRosters = await prisma.dailyRoster.findMany({
    where: { id: { in: dailyRosterIds }, rosterStatus: RosterStatus.PLANNED },
  });
  const activeMovements = await prisma.taskMovement.findMany({
    where: { dailyRosterId: { in: dailyRosters.map((r) => r.id) }, status: MovementStatus.ACTIVE },
  });
  const activeByRosterId = new Map(activeMovements.map((m) => [m.dailyRosterId, m]));

  const reasonPrefix = mode === "SHIFT_CHANGE" ? "Shift change" : "Overtime";
  const reason = note?.trim() ? `${reasonPrefix}: ${note.trim()}` : reasonPrefix;

  let changed = 0;
  await prisma.$transaction(
    async (tx) => {
      for (const dailyRoster of dailyRosters) {
        const active = activeByRosterId.get(dailyRoster.id);
        // A movement existing isn't the same as it having genuinely started —
        // Finalise Roster can be run ahead of a shift's own start (or the
        // whole workDate can be a future date being planned in advance), in
        // which case the movement it opened still has a startTime that
        // hasn't arrived yet. Only treat this as an already-happened "fact"
        // (no drag, can't move into the future, can't overlap) once that
        // startTime has actually passed — otherwise it's still just the plan,
        // wearing a movement row.
        const isLiveFact = !!active && active.startTime.getTime() <= Date.now();

        const dateStr = toDateOnlyString(dailyRoster.workDate);
        const currentStart = active ? active.startTime : dailyRoster.plannedStart;
        const currentFinish = active ? active.scheduledFinish : dailyRoster.plannedFinish;
        const drag = !isLiveFact && mode === "SHIFT_CHANGE";

        let newStart: Date;
        let newFinish: Date;
        if (start && finish) {
          newStart = sydneyInstant(dateStr, start[0], start[1]);
          newFinish = plannedWindow(dateStr, start, finish).plannedFinish;
        } else if (start) {
          newStart = sydneyInstant(dateStr, start[0], start[1]);
          newFinish = drag
            ? new Date(currentFinish.getTime() + (newStart.getTime() - currentStart.getTime()))
            : currentFinish;
        } else {
          // Same forward-midnight-crossing resolution Extend Shift already
          // uses, so a NIGHT finish typed as an early-morning hour rolls to
          // the next day here exactly like it does there.
          newFinish = shiftAwareInstant(shiftWindows!, dateStr, dailyRoster.shift, finish![0], finish![1]);
          newStart = drag
            ? new Date(currentStart.getTime() + (newFinish.getTime() - currentFinish.getTime()))
            : currentStart;
        }
        if (newFinish.getTime() <= newStart.getTime()) continue;

        if (isLiveFact) {
          if (newStart.getTime() > Date.now()) continue; // can't retroactively start something in the future
          const overlapping = await tx.taskMovement.findFirst({
            where: { dailyRosterId: dailyRoster.id, id: { not: active!.id }, actualFinish: { gt: newStart } },
          });
          if (overlapping) continue;
        }

        if (active) {
          // A movement already exists (finalised, whether or not it's
          // actually started yet) — write the correction through it, since
          // that's what the board reads once one's been opened.
          await tx.taskMovement.update({
            where: { id: active.id },
            data: { startTime: newStart, scheduledFinish: newFinish },
          });
          await tx.dailyRoster.update({
            where: { id: dailyRoster.id },
            data: { approvedFinish: newFinish, overrideReason: reason, shiftExtended: mode === "OVERTIME" },
          });
        } else {
          await tx.dailyRoster.update({
            where: { id: dailyRoster.id },
            data: {
              plannedStart: newStart,
              plannedFinish: newFinish,
              approvedFinish: newFinish,
              overrideReason: reason,
              shiftExtended: mode === "OVERTIME",
            },
          });
        }

        await tx.auditLog.create({
          data: {
            entityType: active ? "TaskMovement" : "DailyRoster",
            entityId: active ? active.id : dailyRoster.id,
            action: "BULK_CHANGE_START_TIME",
            changes: {
              newStart: newStartTimeStr ?? null,
              newFinish: newFinishTimeStr ?? null,
              mode,
              note: note ?? null,
              wasLiveFact: isLiveFact,
            },
            changedByUserId: actingUser.id,
          },
        });
        changed++;
      }
    },
    { timeout: 30_000 }
  );

  refresh();
  return { changed, skipped: dailyRosterIds.length - changed };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

// Shared by the single-row and bulk "mark absent" actions. Caller has
// already validated dailyRoster.rosterStatus === PLANNED and leaveTask is a
// real active LEAVE-category task.
async function markAbsentCore(
  tx: TxClient,
  dailyRoster: { id: string; employeeId: string; plannedStart: Date; approvedFinish: Date },
  leaveTask: { id: string; name: string },
  actingUserId: string
) {
  await closeActiveMovement(tx, dailyRoster.id);

  await tx.taskMovement.create({
    data: {
      employeeId: dailyRoster.employeeId,
      dailyRosterId: dailyRoster.id,
      taskId: leaveTask.id,
      startTime: dailyRoster.plannedStart,
      scheduledFinish: dailyRoster.approvedFinish,
      status: MovementStatus.ACTIVE,
      processedByUserId: actingUserId,
    },
  });

  await tx.dailyRoster.update({
    where: { id: dailyRoster.id },
    data: {
      rosterStatus: RosterStatus.ABSENT,
      overrideReason: `Marked absent: ${leaveTask.name}`,
    },
  });

  await tx.auditLog.create({
    data: {
      entityType: "DailyRoster",
      entityId: dailyRoster.id,
      action: "MARK_ABSENT",
      changes: { leaveTask: leaveTask.name },
      changedByUserId: actingUserId,
    },
  });
}

// ---------------------------------------------------------------------------
// Mark absent (single row) / bulk / undo
// ---------------------------------------------------------------------------

export async function markAbsentAction(formData: FormData) {
  const dailyRosterId = String(formData.get("dailyRosterId") ?? "");
  const leaveTaskId = String(formData.get("leaveTaskId") ?? "");
  if (!dailyRosterId || !leaveTaskId) throw new Error("Missing dailyRosterId or leaveTaskId");

  const actingUser = await requireCurrentUser();

  const dailyRoster = await prisma.dailyRoster.findUnique({ where: { id: dailyRosterId } });
  if (!dailyRoster) throw new Error("Roster row not found");
  if (dailyRoster.rosterStatus !== RosterStatus.PLANNED) {
    throw new Error(`Cannot mark absent from status ${dailyRoster.rosterStatus}`);
  }

  const leaveTask = await prisma.task.findFirst({
    where: { id: leaveTaskId, category: TaskCategory.LEAVE, isActive: true },
  });
  if (!leaveTask) throw new Error("Invalid leave type");

  await prisma.$transaction((tx) => markAbsentCore(tx, dailyRoster, leaveTask, actingUser.id));

  refresh();
}

// Same leave type applied to every selected row. Rows that are no longer
// PLANNED by the time this runs (stale UI, double-submit) are silently
// skipped rather than failing the whole batch.
export async function bulkMarkAbsentAction(formData: FormData) {
  const dailyRosterIds = formData.getAll("dailyRosterId").map(String).filter(Boolean);
  const leaveTaskId = String(formData.get("leaveTaskId") ?? "");
  if (dailyRosterIds.length === 0) throw new Error("No rows selected");
  if (!leaveTaskId) throw new Error("Missing leaveTaskId");

  const actingUser = await requireCurrentUser();

  const leaveTask = await prisma.task.findFirst({
    where: { id: leaveTaskId, category: TaskCategory.LEAVE, isActive: true },
  });
  if (!leaveTask) throw new Error("Invalid leave type");

  const dailyRosters = await prisma.dailyRoster.findMany({
    where: { id: { in: dailyRosterIds }, rosterStatus: RosterStatus.PLANNED },
  });

  // One transaction for the whole selection, not one per row — see
  // moveSelectedToTask in lib/actions/board.ts for why.
  await prisma.$transaction(
    async (tx) => {
      for (const dailyRoster of dailyRosters) {
        await markAbsentCore(tx, dailyRoster, leaveTask, actingUser.id);
      }
    },
    { timeout: 30_000 }
  );

  refresh();
}

export async function undoAbsentAction(formData: FormData) {
  const dailyRosterId = String(formData.get("dailyRosterId") ?? "");
  if (!dailyRosterId) throw new Error("Missing dailyRosterId");

  const actingUser = await requireCurrentUser();

  const dailyRoster = await prisma.dailyRoster.findUnique({ where: { id: dailyRosterId } });
  if (!dailyRoster) throw new Error("Roster row not found");
  if (dailyRoster.rosterStatus !== RosterStatus.ABSENT) {
    throw new Error("Roster row is not marked absent");
  }

  const movements = await prisma.taskMovement.findMany({
    where: { dailyRosterId },
    include: { task: true },
  });
  const leaveMovements = movements.filter((m) => m.task.category === TaskCategory.LEAVE);
  const otherMovements = movements.filter((m) => m.task.category !== TaskCategory.LEAVE);

  if (otherMovements.length > 0) {
    // Reachable once the live task board has opened a real work movement for
    // this row (see lib/actions/board.ts) and it's then marked absent.
    // Deciding whether/which movement to reopen is genuinely ambiguous —
    // refusing rather than guessing.
    throw new Error("Cannot auto-undo: this roster row has other task movements. Resolve manually.");
  }

  await prisma.$transaction(async (tx) => {
    if (leaveMovements.length > 0) {
      await tx.taskMovement.deleteMany({ where: { id: { in: leaveMovements.map((m) => m.id) } } });
    }
    await tx.dailyRoster.update({
      where: { id: dailyRoster.id },
      data: { rosterStatus: RosterStatus.PLANNED, overrideReason: null },
    });
    await tx.auditLog.create({
      data: {
        entityType: "DailyRoster",
        entityId: dailyRoster.id,
        action: "UNDO_ABSENT",
        changedByUserId: actingUser.id,
      },
    });
  });

  refresh();
}

// ---------------------------------------------------------------------------
// Remove from roster entirely
// ---------------------------------------------------------------------------

export async function removeFromRosterAction(formData: FormData) {
  const dailyRosterId = String(formData.get("dailyRosterId") ?? "");
  if (!dailyRosterId) throw new Error("Missing dailyRosterId");

  const actingUser = await requireCurrentUser();

  const dailyRoster = await prisma.dailyRoster.findUnique({ where: { id: dailyRosterId } });
  if (!dailyRoster) throw new Error("Roster row not found");
  if (dailyRoster.rosterStatus === RosterStatus.CANCELLED) {
    throw new Error("Already removed from roster");
  }

  await prisma.$transaction(async (tx) => {
    await closeActiveMovement(tx, dailyRoster.id);

    await tx.dailyRoster.update({
      where: { id: dailyRoster.id },
      data: { rosterStatus: RosterStatus.CANCELLED, overrideReason: "Removed from roster" },
    });

    await tx.auditLog.create({
      data: {
        entityType: "DailyRoster",
        entityId: dailyRoster.id,
        action: "REMOVE_FROM_ROSTER",
        changedByUserId: actingUser.id,
      },
    });
  });

  refresh();
}

// ---------------------------------------------------------------------------
// Inline field edits — task and times are edited independently (click the
// field, save on blur/Enter), so each is its own action rather than one
// combined form. Both are called directly from client components, not via
// <form action>, so they take plain arguments rather than FormData.
// ---------------------------------------------------------------------------

export async function updateRosterTaskAction(dailyRosterId: string, taskId: string) {
  const actingUser = await requireCurrentUser();

  const dailyRoster = await prisma.dailyRoster.findUnique({ where: { id: dailyRosterId } });
  if (!dailyRoster) throw new Error("Roster row not found");
  if (dailyRoster.rosterStatus !== RosterStatus.PLANNED) {
    throw new Error(`Cannot edit from status ${dailyRoster.rosterStatus}`);
  }
  if (taskId === dailyRoster.defaultTaskId) return;

  const task = await prisma.task.findFirst({
    where: { id: taskId, isActive: true, category: { not: TaskCategory.LEAVE } },
  });
  if (!task) throw new Error("Invalid task");

  await prisma.$transaction(async (tx) => {
    await tx.dailyRoster.update({ where: { id: dailyRoster.id }, data: { defaultTaskId: task.id } });
    await tx.auditLog.create({
      data: {
        entityType: "DailyRoster",
        entityId: dailyRoster.id,
        action: "EDIT_ROSTER_TASK",
        changes: { task: task.name },
        changedByUserId: actingUser.id,
      },
    });

    // Keep the live board in sync: if this row is already live (has an
    // active movement), move it onto the newly-assigned task now rather
    // than letting the plan and the live movement disagree.
    const activeMovement = await tx.taskMovement.findFirst({
      where: { dailyRosterId: dailyRoster.id, status: MovementStatus.ACTIVE },
    });
    if (activeMovement && activeMovement.taskId !== task.id) {
      await closeActiveMovement(tx, dailyRoster.id);
      await openMovement(tx, dailyRoster, task, actingUser.id, "MOVE_TASK");
    }
  });

  refresh();
}

// A reason is required only when the new start or finish deviates from the
// employee's Standard Roster pattern for this row by more than 15 minutes —
// small adjustments don't need explaining, late-starts/early-finishes/
// overtime-type changes do. Rows with no Standard Roster (casual/manual
// additions) have nothing to deviate from, so never require one. The client
// shows/hides the reason field as a UX nicety; this check is the real gate.
export async function updateRosterTimesAction(
  dailyRosterId: string,
  startTimeStr: string,
  finishTimeStr: string,
  overrideReason?: string
) {
  const actingUser = await requireCurrentUser();

  const dailyRoster = await prisma.dailyRoster.findUnique({ where: { id: dailyRosterId } });
  if (!dailyRoster) throw new Error("Roster row not found");
  if (dailyRoster.rosterStatus !== RosterStatus.PLANNED) {
    throw new Error(`Cannot edit from status ${dailyRoster.rosterStatus}`);
  }

  const start = parseTimeString(startTimeStr);
  const finish = parseTimeString(finishTimeStr);

  let standardWindow: { startMinutes: number; finishMinutes: number } | null = null;
  if (dailyRoster.standardRosterId) {
    const sr = await prisma.standardRoster.findUnique({ where: { id: dailyRoster.standardRosterId } });
    if (sr) {
      const s = hoursMinutesFromTimeValue(sr.startTime);
      const f = hoursMinutesFromTimeValue(sr.finishTime);
      standardWindow = { startMinutes: s.hours * 60 + s.minutes, finishMinutes: f.hours * 60 + f.minutes };
    }
  }

  const newStartMinutes = start[0] * 60 + start[1];
  const newFinishMinutes = finish[0] * 60 + finish[1];
  const deviates =
    standardWindow !== null &&
    (Math.abs(newStartMinutes - standardWindow.startMinutes) > 15 ||
      Math.abs(newFinishMinutes - standardWindow.finishMinutes) > 15);

  const reason = overrideReason?.trim() || null;
  if (deviates && !reason) {
    throw new Error("A reason is required when the change is more than 15 minutes from the standard roster time.");
  }

  const dateStr = toDateOnlyString(dailyRoster.workDate);
  const { plannedStart, plannedFinish } = plannedWindow(dateStr, start, finish);

  await prisma.$transaction(async (tx) => {
    await tx.dailyRoster.update({
      where: { id: dailyRoster.id },
      data: { plannedStart, plannedFinish, approvedFinish: plannedFinish, overrideReason: reason },
    });

    await tx.auditLog.create({
      data: {
        entityType: "DailyRoster",
        entityId: dailyRoster.id,
        action: "EDIT_ROSTER_TIMES",
        changes: { startTime: startTimeStr, finishTime: finishTimeStr, reason },
        changedByUserId: actingUser.id,
      },
    });

    // Keep the live board in sync: an already-open movement's scheduled
    // finish should track the row's approved finish, same as Extend Shift
    // is documented to do (see TaskMovement.scheduledFinish in schema.prisma).
    await tx.taskMovement.updateMany({
      where: { dailyRosterId: dailyRoster.id, status: MovementStatus.ACTIVE },
      data: { scheduledFinish: plannedFinish },
    });
  });

  refresh();
}

// ---------------------------------------------------------------------------
// Casual/Agency pool — add to roster
// ---------------------------------------------------------------------------

// `customHours`, when provided, overrides the shift's canonical window for
// every row in this batch — the "bring some casuals in 10am-6pm for a
// mid-shift" case. Each row still files under whichever AM/PM/NIGHT bucket
// its own `entry.shift` picks (live-board grouping/finalize only); the
// actual planned/approved times come from the override, not from
// getShiftWindows(). Deliberately batch-level, not per-row — matches the
// existing single shared "assign task" control this shares a submit with.
export async function addCasualToRoster(
  dateStr: string,
  taskId: string,
  entries: { employeeId: string; shift: Shift }[],
  customHours?: { startTimeStr: string; finishTimeStr: string }
) {
  if (!DATE_RE.test(dateStr)) throw new Error("Invalid date");
  if (entries.length === 0) throw new Error("No employees selected");

  const actingUser = await requireCurrentUser();
  const workDate = dateOnlyFromString(dateStr);

  const task = await prisma.task.findFirst({
    where: { id: taskId, isActive: true, category: { not: TaskCategory.LEAVE } },
  });
  if (!task) throw new Error("Invalid task");

  let customWindow: { start: [number, number]; finish: [number, number] } | null = null;
  if (customHours) {
    const start = parseTimeString(customHours.startTimeStr);
    const finish = parseTimeString(customHours.finishTimeStr);
    if (start[0] === finish[0] && start[1] === finish[1]) {
      throw new Error("Start and finish can't be the same time");
    }
    customWindow = { start, finish };
  }
  const shiftWindows = customWindow ? null : await getShiftWindows();

  const employees = await prisma.employee.findMany({
    where: { id: { in: entries.map((e) => e.employeeId) }, isActive: true },
  });
  const employeeById = new Map(employees.map((e) => [e.id, e]));

  const rows = entries.flatMap((entry) => {
    const employee = employeeById.get(entry.employeeId);
    if (!employee) return [];

    const window = customWindow ?? shiftWindows![entry.shift];
    const { plannedStart, plannedFinish } = plannedWindow(dateStr, window.start, window.finish);

    return [
      {
        employeeId: employee.id,
        workDate,
        shift: entry.shift,
        plannedStart,
        plannedFinish,
        approvedFinish: plannedFinish,
        defaultTaskId: task.id,
        rosterStatus: RosterStatus.PLANNED,
        rosterSource: RosterSource.MANUAL_CASUAL,
        standardRosterId: null,
      },
    ];
  });

  const result = await prisma.dailyRoster.createMany({ data: rows, skipDuplicates: true });

  await prisma.auditLog.create({
    data: {
      entityType: "DailyRoster",
      entityId: dateStr,
      action: "ADD_CASUAL_TO_ROSTER",
      changes: {
        workDate: dateStr,
        task: task.name,
        requested: entries.length,
        created: result.count,
        customHours: customHours ? { start: customHours.startTimeStr, finish: customHours.finishTimeStr } : null,
      },
      changedByUserId: actingUser.id,
    },
  });

  refresh();
  return { created: result.count };
}
