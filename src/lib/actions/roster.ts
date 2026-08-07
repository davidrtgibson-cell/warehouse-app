"use server";

import { refresh } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCurrentUser } from "@/lib/auth";
import { standardRosterEligibilityWhere } from "@/lib/roster-queries";
import {
  DATE_RE,
  dayOfWeekForDateString,
  plannedWindow,
  SHIFT_WINDOWS,
  hoursMinutesFromTimeValue,
} from "@/lib/schedule";
import { dateOnlyFromString } from "@/lib/format";
import {
  MovementStatus,
  RosterSource,
  RosterStatus,
  Shift,
  TaskCategory,
} from "@/generated/prisma/client";

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
// Mark absent / undo
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

  const activeMovement = await prisma.taskMovement.findFirst({
    where: { dailyRosterId, status: MovementStatus.ACTIVE },
  });
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    if (activeMovement) {
      await tx.taskMovement.update({
        where: { id: activeMovement.id },
        data: {
          status: MovementStatus.CLOSED,
          actualFinish: now,
          durationMinutes: Math.round((now.getTime() - activeMovement.startTime.getTime()) / 60000),
        },
      });
    }

    await tx.taskMovement.create({
      data: {
        employeeId: dailyRoster.employeeId,
        dailyRosterId: dailyRoster.id,
        taskId: leaveTask.id,
        startTime: dailyRoster.plannedStart,
        scheduledFinish: dailyRoster.approvedFinish,
        status: MovementStatus.ACTIVE,
        processedByUserId: actingUser.id,
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
        changedByUserId: actingUser.id,
      },
    });
  });

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
    // Only reachable once the live task board can open movements of its own
    // (doesn't exist yet). Refusing rather than guessing which movement, if
    // any, should be reopened.
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
// Casual/Agency pool — add to roster
// ---------------------------------------------------------------------------

export async function addCasualToRoster(
  dateStr: string,
  taskId: string,
  entries: { employeeId: string; shift: Shift }[]
) {
  if (!DATE_RE.test(dateStr)) throw new Error("Invalid date");
  if (entries.length === 0) throw new Error("No employees selected");

  const actingUser = await requireCurrentUser();
  const workDate = dateOnlyFromString(dateStr);

  const task = await prisma.task.findFirst({
    where: { id: taskId, isActive: true, category: { not: TaskCategory.LEAVE } },
  });
  if (!task) throw new Error("Invalid task");

  const employees = await prisma.employee.findMany({
    where: { id: { in: entries.map((e) => e.employeeId) }, isActive: true },
  });
  const employeeById = new Map(employees.map((e) => [e.id, e]));

  const rows = entries.flatMap((entry) => {
    const employee = employeeById.get(entry.employeeId);
    if (!employee) return [];

    const window = SHIFT_WINDOWS[entry.shift];
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
      changes: { workDate: dateStr, task: task.name, requested: entries.length, created: result.count },
      changedByUserId: actingUser.id,
    },
  });

  refresh();
  return { created: result.count };
}
