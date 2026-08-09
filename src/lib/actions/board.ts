"use server";

import { refresh } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCurrentUser } from "@/lib/auth";
import { closeActiveMovement, openMovement } from "@/lib/movement-core";
import { MovementStatus, RosterStatus, Shift, TaskCategory } from "@/generated/prisma/client";
import { dateOnlyFromString, fmtTimeSydney, toDateOnlyString } from "@/lib/format";
import { getShiftWindows, parseTimeString, shiftAwareInstant } from "@/lib/schedule";

// Called directly from the live board's client component (not a <form
// action>), so it takes plain arguments. Closes each row's current active
// movement and opens a new one on `taskId`, both at `atTimeStr` (defaults to
// "now" when omitted) — lets a leader backdate a batch of moves to when they
// actually happened instead of always stamping the moment they got around to
// clicking the button (see the Layla Smith incident: a move entered late
// against a shift that already ended read as bogus multi-hour "overtime").
// Rows with no active movement (finalize hasn't reached them yet), already
// on the target task, or where `at` would predate that row's own current
// movement (would create a negative-duration close — two movements for the
// same person can never overlap) are silently skipped rather than failing
// the whole selection.
export async function moveSelectedToTask(dailyRosterIds: string[], taskId: string, atTimeStr?: string) {
  if (dailyRosterIds.length === 0) throw new Error("No rows selected");

  const actingUser = await requireCurrentUser();

  const task = await prisma.task.findFirst({
    where: { id: taskId, isActive: true, category: { not: TaskCategory.LEAVE } },
  });
  if (!task) throw new Error("Invalid task");

  const dailyRosters = await prisma.dailyRoster.findMany({
    where: { id: { in: dailyRosterIds }, rosterStatus: RosterStatus.PLANNED },
  });

  const activeMovements = await prisma.taskMovement.findMany({
    where: { dailyRosterId: { in: dailyRosters.map((d) => d.id) }, status: MovementStatus.ACTIVE },
  });
  const activeByRosterId = new Map(activeMovements.map((m) => [m.dailyRosterId, m]));
  const shiftWindows = atTimeStr ? await getShiftWindows() : null;

  let moved = 0;
  for (const dailyRoster of dailyRosters) {
    const active = activeByRosterId.get(dailyRoster.id);
    if (!active || active.taskId === task.id) continue;

    const at = atTimeStr
      ? shiftAwareInstant(
          shiftWindows!,
          toDateOnlyString(dailyRoster.workDate),
          dailyRoster.shift,
          ...parseTimeString(atTimeStr)
        )
      : new Date();
    if (at.getTime() > Date.now()) throw new Error("Move time can't be in the future");
    if (at.getTime() < active.startTime.getTime()) continue;

    await prisma.$transaction(async (tx) => {
      await closeActiveMovement(tx, dailyRoster.id, at);
      await openMovement(tx, dailyRoster, task, actingUser.id, "MOVE_TASK", at);
    });
    moved++;
  }

  refresh();
  return { moved };
}

// Live-board "Extend Shift" — the schema already has DailyRoster.shiftExtended
// / extensionNote for exactly this (see schema.prisma), surfaced today only
// as a read-only badge on /roster, but nothing ever wrote those fields. This
// is that write path, deliberately lightweight per the schema's own framing
// ("boolean-ish: new finish time + optional note", no approval workflow).
//
// Only touches approvedFinish (+ the flag/note) — never plannedStart/
// plannedFinish, unlike updateRosterTimesAction, so the original plan stays
// intact as history and "planned vs. approved" stays a meaningful
// distinction. `taskId` is optional: null keeps the person on their current
// task (just pushes scheduledFinish out); a task id closes the current
// movement and opens a new one on it now, same as a live move, so overtime
// on a different task is captured as its own movement. Rows with no active
// movement, or where the new finish doesn't actually extend past the row's
// current approvedFinish, are silently skipped rather than failing the
// whole batch — same convention as moveSelectedToTask.
export async function extendShiftAction(
  dailyRosterIds: string[],
  newFinishTimeStr: string,
  taskId: string | null,
  note?: string
) {
  if (dailyRosterIds.length === 0) throw new Error("No rows selected");

  const actingUser = await requireCurrentUser();

  let task: { id: string; name: string } | null = null;
  if (taskId) {
    task = await prisma.task.findFirst({
      where: { id: taskId, isActive: true, category: { not: TaskCategory.LEAVE } },
    });
    if (!task) throw new Error("Invalid task");
  }

  const dailyRosters = await prisma.dailyRoster.findMany({
    where: { id: { in: dailyRosterIds }, rosterStatus: RosterStatus.PLANNED },
  });
  const activeMovements = await prisma.taskMovement.findMany({
    where: { dailyRosterId: { in: dailyRosters.map((d) => d.id) }, status: MovementStatus.ACTIVE },
  });
  const activeByRosterId = new Map(activeMovements.map((m) => [m.dailyRosterId, m]));
  const shiftWindows = await getShiftWindows();

  let extended = 0;
  for (const dailyRoster of dailyRosters) {
    const active = activeByRosterId.get(dailyRoster.id);
    if (!active) continue;

    const newFinish = shiftAwareInstant(
      shiftWindows,
      toDateOnlyString(dailyRoster.workDate),
      dailyRoster.shift,
      ...parseTimeString(newFinishTimeStr)
    );
    if (newFinish.getTime() <= dailyRoster.approvedFinish.getTime()) continue;
    if (newFinish.getTime() <= active.startTime.getTime()) continue;

    await prisma.$transaction(async (tx) => {
      await tx.dailyRoster.update({
        where: { id: dailyRoster.id },
        data: { approvedFinish: newFinish, shiftExtended: true, extensionNote: note?.trim() || null },
      });

      if (task && task.id !== active.taskId) {
        await closeActiveMovement(tx, dailyRoster.id);
        await openMovement(tx, { ...dailyRoster, approvedFinish: newFinish }, task, actingUser.id, "EXTEND_SHIFT_MOVE_TASK");
      } else {
        await tx.taskMovement.updateMany({
          where: { dailyRosterId: dailyRoster.id, status: MovementStatus.ACTIVE },
          data: { scheduledFinish: newFinish },
        });
      }

      await tx.auditLog.create({
        data: {
          entityType: "DailyRoster",
          entityId: dailyRoster.id,
          action: "EXTEND_SHIFT",
          changes: { newFinish: newFinishTimeStr, taskId: task?.id ?? null, note: note ?? null },
          changedByUserId: actingUser.id,
        },
      });
    });
    extended++;
  }

  refresh();
  return { extended };
}

// ---------------------------------------------------------------------------
// Per-employee shift timeline — the live board's detail panel shows every
// movement for the day (not just the active one) so a leader can see how
// someone's whole shift has gone, and correct a wrong time after the fact.
// ---------------------------------------------------------------------------

export async function getMovementTimeline(dailyRosterId: string) {
  const movements = await prisma.taskMovement.findMany({
    where: { dailyRosterId },
    include: { task: true },
    orderBy: { startTime: "asc" },
  });

  return movements.map((m) => ({
    id: m.id,
    taskName: m.task.name,
    startTime: m.startTime,
    scheduledFinish: m.scheduledFinish,
    actualFinish: m.actualFinish,
    durationMinutes: m.durationMinutes,
    status: m.status,
  }));
}

// Same idea, the other axis: every movement anyone has had against a given
// task on this workDate+shift (not just who's currently on it), so clicking
// a task-card heading can show the full roster of who's touched it today —
// currently-on-it and moved-on both, for cards with too many people to see
// in one scroll.
export async function getTaskTimeline(taskId: string, workDateStr: string, shift: Shift) {
  const movements = await prisma.taskMovement.findMany({
    where: { taskId, dailyRoster: { workDate: dateOnlyFromString(workDateStr), shift } },
    include: { employee: true },
    orderBy: { startTime: "asc" },
  });

  return movements.map((m) => ({
    id: m.id,
    dailyRosterId: m.dailyRosterId,
    firstName: m.employee.firstName,
    lastName: m.employee.lastName,
    employeeCode: m.employee.employeeCode,
    startTime: m.startTime,
    scheduledFinish: m.scheduledFinish,
    actualFinish: m.actualFinish,
    durationMinutes: m.durationMinutes,
    status: m.status,
  }));
}

// Corrects a movement's start (and, for a closed movement, finish) after the
// fact — the "I made the move half an hour ago, updating the record now"
// case. Two movements for the same person can never overlap in time, so any
// edit is checked against every other movement on the same roster row
// (not just its immediate neighbours — an edit could in principle be pushed
// past more than one adjacent movement).
//
// Movements are always opened back-to-back in this app (closeActiveMovement
// + openMovement run in the same transaction, at the same instant), so an
// edited movement's immediate neighbour almost always shares its old
// boundary exactly. When that's the case, drag the neighbour's matching
// edge along with the edit instead of requiring a second, separate edit to
// avoid an overlap rejection (see the Diego Young test case: editing
// Packing's finish past GTP Picking's start used to just get rejected) or
// leaving a gap between the two.
export async function updateMovementTimesAction(taskMovementId: string, startTimeStr: string, finishTimeStr?: string) {
  const actingUser = await requireCurrentUser();

  const movement = await prisma.taskMovement.findUnique({
    where: { id: taskMovementId },
    include: { dailyRoster: true },
  });
  if (!movement) throw new Error("Movement not found");

  const dateStr = toDateOnlyString(movement.dailyRoster.workDate);
  const shift = movement.dailyRoster.shift;
  const shiftWindows = await getShiftWindows();
  const newStart = shiftAwareInstant(shiftWindows, dateStr, shift, ...parseTimeString(startTimeStr));

  let newFinish: Date | null = null;
  if (movement.status === MovementStatus.CLOSED) {
    if (!finishTimeStr) throw new Error("Finish time is required for a completed task");
    newFinish = shiftAwareInstant(shiftWindows, dateStr, shift, ...parseTimeString(finishTimeStr));
    if (newFinish.getTime() <= newStart.getTime()) throw new Error("Finish must be after start");
  } else if (newStart.getTime() > Date.now()) {
    throw new Error("Start time can't be in the future");
  }

  const siblings = await prisma.taskMovement.findMany({
    where: { dailyRosterId: movement.dailyRosterId, id: { not: movement.id } },
    include: { task: true },
  });

  // Every edit in this UI is minute-granular (<input type="time">), but a
  // movement's stored startTime/actualFinish can carry whatever sub-second
  // precision `new Date()` had at the moment it was opened/closed live. Two
  // instants that are the "same time" to a leader (and look identical in
  // the UI) can differ by a few hundred ms — comparing exact getTime() would
  // both misdetect "did this field actually change" and, worse, miss a
  // touching boundary with a neighbour entirely (e.g. actualFinish
  // 06:28:00.000 vs the next movement's startTime 06:28:00.318). Round to
  // the minute before comparing.
  const sameMinute = (a: Date, b: Date) => Math.floor(a.getTime() / 60000) === Math.floor(b.getTime() / 60000);

  const startMoved = !sameMinute(newStart, movement.startTime);
  const finishMoved = newFinish !== null && !(movement.actualFinish && sameMinute(newFinish, movement.actualFinish));

  const previous = siblings.find((s) => s.actualFinish && sameMinute(s.actualFinish, movement.startTime));
  const next = movement.actualFinish
    ? siblings.find((s) => sameMinute(s.startTime, movement.actualFinish!))
    : undefined;
  const cascadePrevious = previous && startMoved;
  const cascadeNext = next && finishMoved;

  if (cascadePrevious && previous.startTime.getTime() >= newStart.getTime()) {
    throw new Error(`That would end ${previous.task.name} before it started`);
  }
  if (cascadeNext) {
    if (next.actualFinish && next.actualFinish.getTime() <= newFinish!.getTime()) {
      throw new Error(`That would start ${next.task.name} after it finished`);
    }
    if (!next.actualFinish && newFinish!.getTime() > Date.now()) {
      throw new Error(`That would push ${next.task.name}'s start into the future`);
    }
  }

  // Validate against every OTHER sibling — excluding the immediate
  // neighbour(s) being cascaded, since their shared edge is about to move
  // together with this one rather than overlap.
  const newEnd = newFinish ? newFinish.getTime() : Infinity;
  for (const sibling of siblings) {
    if (cascadePrevious && sibling.id === previous.id) continue;
    if (cascadeNext && sibling.id === next.id) continue;
    const siblingEnd = sibling.actualFinish ? sibling.actualFinish.getTime() : Infinity;
    const overlaps = newStart.getTime() < siblingEnd && sibling.startTime.getTime() < newEnd;
    if (overlaps) {
      const finishStr = sibling.actualFinish ? fmtTimeSydney(sibling.actualFinish) : "ongoing";
      throw new Error(`Overlaps with ${sibling.task.name} (${fmtTimeSydney(sibling.startTime)}–${finishStr})`);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.taskMovement.update({
      where: { id: movement.id },
      data: {
        startTime: newStart,
        ...(newFinish
          ? { actualFinish: newFinish, durationMinutes: Math.round((newFinish.getTime() - newStart.getTime()) / 60000) }
          : {}),
      },
    });

    if (cascadePrevious) {
      await tx.taskMovement.update({
        where: { id: previous.id },
        data: {
          actualFinish: newStart,
          durationMinutes: Math.round((newStart.getTime() - previous.startTime.getTime()) / 60000),
        },
      });
    }
    if (cascadeNext) {
      await tx.taskMovement.update({
        where: { id: next.id },
        data: {
          startTime: newFinish!,
          ...(next.actualFinish
            ? { durationMinutes: Math.round((next.actualFinish.getTime() - newFinish!.getTime()) / 60000) }
            : {}),
        },
      });
    }

    await tx.auditLog.create({
      data: {
        entityType: "TaskMovement",
        entityId: movement.id,
        action: "EDIT_MOVEMENT_TIMES",
        changes: {
          startTime: startTimeStr,
          finishTime: finishTimeStr ?? null,
          cascadedPrevious: cascadePrevious ? previous.id : null,
          cascadedNext: cascadeNext ? next.id : null,
        },
        changedByUserId: actingUser.id,
      },
    });
  });

  refresh();
}
