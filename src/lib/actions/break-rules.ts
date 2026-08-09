"use server";

import { refresh } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

// Break rules — the admin-configurable "how many unpaid minutes, above
// what hours-worked threshold" table (see BreakRule in schema.prisma).
// Deliberately just a flat, freely-editable list (add/edit/retire/reorder)
// rather than anything tied to one specific EA's wording — a different
// business's rules are just different rows here, no code change. The
// `description` field is meant to carry whatever free-text justification
// a leader wants (e.g. quoting the actual EA clause), for context only —
// only minHoursWorked/unpaidMinutes feed the actual calculation, which
// lives in src/lib/break-rules.ts (this file is only the CRUD actions).

function parseHours(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid hours: ${value}`);
  return n;
}

function parseMinutes(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error(`Invalid minutes: ${value}`);
  return n;
}

export async function createBreakRuleAction(description: string, minHoursWorkedStr: string, unpaidMinutesStr: string) {
  const actingUser = await requireAdmin();
  const trimmedDescription = description.trim();
  if (!trimmedDescription) throw new Error("Description is required");
  const minHoursWorked = parseHours(minHoursWorkedStr);
  const unpaidMinutes = parseMinutes(unpaidMinutesStr);

  const maxSortOrder = await prisma.breakRule.aggregate({ _max: { sortOrder: true } });
  const sortOrder = (maxSortOrder._max.sortOrder ?? -1) + 1;

  await prisma.$transaction(async (tx) => {
    const rule = await tx.breakRule.create({
      data: { description: trimmedDescription, minHoursWorked, unpaidMinutes, sortOrder },
    });
    await tx.auditLog.create({
      data: {
        entityType: "BreakRule",
        entityId: rule.id,
        action: "CREATE_BREAK_RULE",
        changes: { description: trimmedDescription, minHoursWorked, unpaidMinutes },
        changedByUserId: actingUser.id,
      },
    });
  });

  refresh();
}

export async function updateBreakRuleAction(
  id: string,
  description: string,
  minHoursWorkedStr: string,
  unpaidMinutesStr: string
) {
  const actingUser = await requireAdmin();
  const trimmedDescription = description.trim();
  if (!trimmedDescription) throw new Error("Description is required");
  const minHoursWorked = parseHours(minHoursWorkedStr);
  const unpaidMinutes = parseMinutes(unpaidMinutesStr);

  const existing = await prisma.breakRule.findUnique({ where: { id } });
  if (!existing) throw new Error("Break rule not found");

  await prisma.$transaction(async (tx) => {
    await tx.breakRule.update({
      where: { id },
      data: { description: trimmedDescription, minHoursWorked, unpaidMinutes },
    });
    await tx.auditLog.create({
      data: {
        entityType: "BreakRule",
        entityId: id,
        action: "UPDATE_BREAK_RULE",
        changes: {
          from: {
            description: existing.description,
            minHoursWorked: existing.minHoursWorked.toString(),
            unpaidMinutes: existing.unpaidMinutes,
          },
          to: { description: trimmedDescription, minHoursWorked, unpaidMinutes },
        },
        changedByUserId: actingUser.id,
      },
    });
  });

  refresh();
}

// Soft delete only — retiring a rule that was in effect for past shifts
// shouldn't erase the record of it having existed (reporting/audit may
// still reference it).
export async function setBreakRuleActiveAction(id: string, isActive: boolean) {
  const actingUser = await requireAdmin();

  const existing = await prisma.breakRule.findUnique({ where: { id } });
  if (!existing) throw new Error("Break rule not found");

  await prisma.$transaction(async (tx) => {
    await tx.breakRule.update({ where: { id }, data: { isActive } });
    await tx.auditLog.create({
      data: {
        entityType: "BreakRule",
        entityId: id,
        action: isActive ? "REACTIVATE_BREAK_RULE" : "RETIRE_BREAK_RULE",
        changes: { description: existing.description },
        changedByUserId: actingUser.id,
      },
    });
  });

  refresh();
}

// Swaps sortOrder with the adjacent ACTIVE rule (retired rules aren't part
// of the visible ordering a leader is arranging).
export async function moveBreakRuleAction(id: string, direction: "up" | "down") {
  const actingUser = await requireAdmin();

  const activeRules = await prisma.breakRule.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  const index = activeRules.findIndex((r) => r.id === id);
  if (index === -1) throw new Error("Break rule not found or not active");

  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= activeRules.length) return; // already at the end — no-op

  const a = activeRules[index];
  const b = activeRules[swapIndex];

  await prisma.$transaction(async (tx) => {
    await tx.breakRule.update({ where: { id: a.id }, data: { sortOrder: b.sortOrder } });
    await tx.breakRule.update({ where: { id: b.id }, data: { sortOrder: a.sortOrder } });
    await tx.auditLog.create({
      data: {
        entityType: "BreakRule",
        entityId: a.id,
        action: "REORDER_BREAK_RULE",
        changes: { swappedWith: b.description, direction },
        changedByUserId: actingUser.id,
      },
    });
  });

  refresh();
}
