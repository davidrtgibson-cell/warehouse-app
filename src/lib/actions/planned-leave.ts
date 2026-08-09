"use server";

import { refresh } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { DATE_RE } from "@/lib/schedule";
import { dateOnlyFromString } from "@/lib/format";
import { TaskCategory } from "@/generated/prisma/client";

// Planned leave (BACKLOG.md Tier 2 #1) — a future date range an employee is
// known to be on leave, entered ahead of time. Doesn't touch DailyRoster
// directly: generateDailyRosterFromStandard (lib/actions/roster.ts) checks
// this table at generation time instead (see its own doc comment). ADMIN-
// only, same as every other Settings action.

async function assertLeaveTask(taskId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("Task not found");
  if (task.category !== TaskCategory.LEAVE) throw new Error("Must be a Leave-category task");
  return task;
}

function parseDate(label: string, value: string): Date {
  if (!DATE_RE.test(value)) throw new Error(`Invalid ${label} date`);
  return dateOnlyFromString(value);
}

export async function createPlannedLeaveAction(employeeId: string, taskId: string, dateFromStr: string, dateToStr: string) {
  const actingUser = await requireAdmin();

  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) throw new Error("Employee not found");
  const task = await assertLeaveTask(taskId);

  const dateFrom = parseDate("from", dateFromStr);
  const dateTo = parseDate("to", dateToStr);
  if (dateFrom > dateTo) throw new Error("From date must be on or before the to date");

  await prisma.$transaction(async (tx) => {
    const leave = await tx.plannedLeave.create({ data: { employeeId, taskId, dateFrom, dateTo } });
    await tx.auditLog.create({
      data: {
        entityType: "PlannedLeave",
        entityId: leave.id,
        action: "CREATE_PLANNED_LEAVE",
        changes: {
          employeeCode: employee.employeeCode,
          taskName: task.name,
          dateFrom: dateFromStr,
          dateTo: dateToStr,
        },
        changedByUserId: actingUser.id,
      },
    });
  });

  refresh();
}

// No soft-delete convention here — unlike Task/Employee/User, a planned
// leave row isn't a persistent reference other data points back to (no
// DailyRoster foreign key to it). Deleting only affects roster rows not yet
// generated; already-generated DailyRoster rows are untouched (see the
// model's own doc comment in schema.prisma).
export async function deletePlannedLeaveAction(id: string) {
  const actingUser = await requireAdmin();

  const existing = await prisma.plannedLeave.findUnique({ where: { id }, include: { employee: true, task: true } });
  if (!existing) throw new Error("Planned leave not found");

  await prisma.$transaction(async (tx) => {
    await tx.plannedLeave.delete({ where: { id } });
    await tx.auditLog.create({
      data: {
        entityType: "PlannedLeave",
        entityId: id,
        action: "DELETE_PLANNED_LEAVE",
        changes: { employeeCode: existing.employee.employeeCode, taskName: existing.task.name },
        changedByUserId: actingUser.id,
      },
    });
  });

  refresh();
}
