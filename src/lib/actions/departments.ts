"use server";

import { refresh } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

// Department maintenance — add/retire (soft delete via isActive, same
// convention as Task/BreakRule/Employee), reorder. ADMIN-only, same as
// every other Settings action (see requireAdmin in src/lib/auth.ts).
//
// Mirrors lib/actions/tasks.ts closely on purpose — same shape of problem
// (an admin-managed, reorderable, soft-deletable named list), just without
// Task's category/isPaid/isVisible fields.

export async function createDepartmentAction(name: string) {
  const actingUser = await requireAdmin();
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("Name is required");

  const existing = await prisma.department.findUnique({ where: { name: trimmedName } });
  if (existing) throw new Error("A department with that name already exists");

  const maxSortOrder = await prisma.department.aggregate({ _max: { sortOrder: true } });
  const sortOrder = (maxSortOrder._max.sortOrder ?? -1) + 1;

  await prisma.$transaction(async (tx) => {
    const department = await tx.department.create({ data: { name: trimmedName, sortOrder } });
    await tx.auditLog.create({
      data: {
        entityType: "Department",
        entityId: department.id,
        action: "CREATE_DEPARTMENT",
        changes: { name: trimmedName },
        changedByUserId: actingUser.id,
      },
    });
  });

  refresh();
}

export async function updateDepartmentAction(id: string, name: string) {
  const actingUser = await requireAdmin();
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("Name is required");

  const existing = await prisma.department.findUnique({ where: { id } });
  if (!existing) throw new Error("Department not found");

  const nameClash = await prisma.department.findFirst({ where: { name: trimmedName, id: { not: id } } });
  if (nameClash) throw new Error("A department with that name already exists");

  await prisma.$transaction(async (tx) => {
    await tx.department.update({ where: { id }, data: { name: trimmedName } });
    await tx.auditLog.create({
      data: {
        entityType: "Department",
        entityId: id,
        action: "UPDATE_DEPARTMENT",
        changes: { from: { name: existing.name }, to: { name: trimmedName } },
        changedByUserId: actingUser.id,
      },
    });
  });

  refresh();
}

// Soft delete only — same isActive convention as Task/BreakRule/Employee.
// A retired department stays intact for every Employee row already
// assigned to it; it just stops appearing as a choice for new ones.
export async function setDepartmentActiveAction(id: string, isActive: boolean) {
  const actingUser = await requireAdmin();

  const existing = await prisma.department.findUnique({ where: { id } });
  if (!existing) throw new Error("Department not found");

  await prisma.$transaction(async (tx) => {
    await tx.department.update({ where: { id }, data: { isActive } });
    await tx.auditLog.create({
      data: {
        entityType: "Department",
        entityId: id,
        action: isActive ? "REACTIVATE_DEPARTMENT" : "RETIRE_DEPARTMENT",
        changes: { name: existing.name },
        changedByUserId: actingUser.id,
      },
    });
  });

  refresh();
}

// Swaps sortOrder with the adjacent ACTIVE department (retired departments
// aren't part of the visible ordering an admin is arranging).
export async function moveDepartmentAction(id: string, direction: "up" | "down") {
  const actingUser = await requireAdmin();

  const activeDepartments = await prisma.department.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
  const index = activeDepartments.findIndex((d) => d.id === id);
  if (index === -1) throw new Error("Department not found or not active");

  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= activeDepartments.length) return; // already at the end — no-op

  const a = activeDepartments[index];
  const b = activeDepartments[swapIndex];

  await prisma.$transaction(async (tx) => {
    await tx.department.update({ where: { id: a.id }, data: { sortOrder: b.sortOrder } });
    await tx.department.update({ where: { id: b.id }, data: { sortOrder: a.sortOrder } });
    await tx.auditLog.create({
      data: {
        entityType: "Department",
        entityId: a.id,
        action: "REORDER_DEPARTMENT",
        changes: { swappedWith: b.name, direction },
        changedByUserId: actingUser.id,
      },
    });
  });

  refresh();
}
