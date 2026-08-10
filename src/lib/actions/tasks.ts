"use server";

import { refresh } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { TaskCategory } from "@/generated/prisma/client";

// Task maintenance (BACKLOG.md Tier 2 #1) — add/retire tasks (soft delete
// via isActive, same convention as BreakRule/Department/Employee), reorder,
// and the isPaid flag (see its doc comment on Task in schema.prisma).
// ADMIN-only, same as every other Settings action (see requireAdmin in
// src/lib/auth.ts).

function parseCategory(value: string): TaskCategory {
  if (value !== "PRODUCTIVE" && value !== "INDIRECT" && value !== "LEAVE") {
    throw new Error(`Invalid category: ${value}`);
  }
  return value;
}

export async function createTaskAction(name: string, category: string, isPaid: boolean) {
  const actingUser = await requireAdmin();
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("Name is required");
  const parsedCategory = parseCategory(category);

  const existing = await prisma.task.findUnique({ where: { name: trimmedName } });
  if (existing) throw new Error("A task with that name already exists");

  const maxSortOrder = await prisma.task.aggregate({ _max: { sortOrder: true } });
  const sortOrder = (maxSortOrder._max.sortOrder ?? -1) + 1;

  await prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: { name: trimmedName, category: parsedCategory, isPaid, sortOrder },
    });
    await tx.auditLog.create({
      data: {
        entityType: "Task",
        entityId: task.id,
        action: "CREATE_TASK",
        changes: { name: trimmedName, category: parsedCategory, isPaid },
        changedByUserId: actingUser.id,
      },
    });
  });

  refresh();
}

export async function updateTaskAction(id: string, name: string, category: string, isPaid: boolean) {
  const actingUser = await requireAdmin();
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("Name is required");
  const parsedCategory = parseCategory(category);

  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) throw new Error("Task not found");

  const nameClash = await prisma.task.findFirst({ where: { name: trimmedName, id: { not: id } } });
  if (nameClash) throw new Error("A task with that name already exists");

  await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id }, data: { name: trimmedName, category: parsedCategory, isPaid } });
    await tx.auditLog.create({
      data: {
        entityType: "Task",
        entityId: id,
        action: "UPDATE_TASK",
        changes: {
          from: { name: existing.name, category: existing.category, isPaid: existing.isPaid },
          to: { name: trimmedName, category: parsedCategory, isPaid },
        },
        changedByUserId: actingUser.id,
      },
    });
  });

  refresh();
}

// Soft delete only — same isActive convention as BreakRule/Department/
// Employee. A retired task stays intact for every past StandardRoster/
// DailyRoster/TaskMovement/ProductivityVolume row that already references
// it; it just stops appearing as a choice for new ones.
export async function setTaskActiveAction(id: string, isActive: boolean) {
  const actingUser = await requireAdmin();

  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) throw new Error("Task not found");

  await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id }, data: { isActive } });
    await tx.auditLog.create({
      data: {
        entityType: "Task",
        entityId: id,
        action: isActive ? "REACTIVATE_TASK" : "RETIRE_TASK",
        changes: { name: existing.name },
        changedByUserId: actingUser.id,
      },
    });
  });

  refresh();
}

// Board-visibility toggle — see Task.isVisible's doc comment in
// schema.prisma. Independent of isActive: a hidden task stays a normal,
// selectable move target on the live board, it just doesn't get a
// persistent card there.
export async function setTaskVisibleAction(id: string, isVisible: boolean) {
  const actingUser = await requireAdmin();

  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) throw new Error("Task not found");

  await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id }, data: { isVisible } });
    await tx.auditLog.create({
      data: {
        entityType: "Task",
        entityId: id,
        action: isVisible ? "SHOW_TASK_ON_BOARD" : "HIDE_TASK_FROM_BOARD",
        changes: { name: existing.name },
        changedByUserId: actingUser.id,
      },
    });
  });

  refresh();
}

// Swaps sortOrder with the adjacent ACTIVE task (retired tasks aren't part
// of the visible ordering an admin is arranging).
export async function moveTaskAction(id: string, direction: "up" | "down") {
  const actingUser = await requireAdmin();

  const activeTasks = await prisma.task.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
  const index = activeTasks.findIndex((t) => t.id === id);
  if (index === -1) throw new Error("Task not found or not active");

  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= activeTasks.length) return; // already at the end — no-op

  const a = activeTasks[index];
  const b = activeTasks[swapIndex];

  await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id: a.id }, data: { sortOrder: b.sortOrder } });
    await tx.task.update({ where: { id: b.id }, data: { sortOrder: a.sortOrder } });
    await tx.auditLog.create({
      data: {
        entityType: "Task",
        entityId: a.id,
        action: "REORDER_TASK",
        changes: { swappedWith: b.name, direction },
        changedByUserId: actingUser.id,
      },
    });
  });

  refresh();
}
