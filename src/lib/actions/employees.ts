"use server";

import { refresh } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { EmploymentType, Shift } from "@/generated/prisma/client";
import { isNewPermOrPartTime, isTempToPermConversion } from "@/lib/employee-rules";

// Team member maintenance (BACKLOG.md Tier 2 #1) — add/retire employees
// (soft delete via isActive, same convention as Task/BreakRule/User),
// active/inactive, and employment-type changes including the temp→perm
// conversion case. ADMIN-only, same as every other Settings action.

const EMPLOYMENT_TYPES = new Set<string>(Object.values(EmploymentType));
const SHIFTS = new Set<string>(Object.values(Shift));

function parseEmploymentType(value: string): EmploymentType {
  if (!EMPLOYMENT_TYPES.has(value)) throw new Error(`Invalid employment type: ${value}`);
  return value as EmploymentType;
}

function parseShift(value: string | null): Shift | null {
  if (value === null || value === "") return null;
  if (!SHIFTS.has(value)) throw new Error(`Invalid shift: ${value}`);
  return value as Shift;
}

export type EmployeeInput = {
  employeeCode: string;
  firstName: string;
  lastName: string;
  employmentType: string;
  agencyName: string | null;
  departmentId: string | null;
  defaultShift: string | null;
};

// Returns whether this new hire needs the "go build their Standard Roster
// pattern" prompt — any brand-new PERMANENT/PART_TIME employee, since a
// pattern can't exist yet for someone who didn't exist a moment ago
// (BACKLOG.md Tier 5: "adding a new perm/part-time team member should
// prompt to build their standard roster"). Same prompt UI as the
// temp→perm conversion case in updateEmployeeAction below, just a
// different trigger condition (no "from" type to compare against).
export async function createEmployeeAction(input: EmployeeInput): Promise<{ suggestStandardRoster: boolean }> {
  const actingUser = await requireAdmin();
  const employeeCode = input.employeeCode.trim();
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!employeeCode) throw new Error("Employee code is required");
  if (!firstName) throw new Error("First name is required");
  if (!lastName) throw new Error("Last name is required");
  const employmentType = parseEmploymentType(input.employmentType);
  const defaultShift = parseShift(input.defaultShift);

  const existing = await prisma.employee.findUnique({ where: { employeeCode } });
  if (existing) throw new Error("An employee with that code already exists");

  if (input.departmentId) {
    const dept = await prisma.department.findUnique({ where: { id: input.departmentId } });
    if (!dept) throw new Error("Department not found");
  }

  await prisma.$transaction(async (tx) => {
    const employee = await tx.employee.create({
      data: {
        employeeCode,
        firstName,
        lastName,
        employmentType,
        agencyName: employmentType === EmploymentType.AGENCY ? input.agencyName?.trim() || null : null,
        departmentId: input.departmentId || null,
        defaultShift,
      },
    });
    await tx.auditLog.create({
      data: {
        entityType: "Employee",
        entityId: employee.id,
        action: "CREATE_EMPLOYEE",
        changes: { employeeCode, firstName, lastName, employmentType },
        changedByUserId: actingUser.id,
      },
    });
  });

  refresh();
  return { suggestStandardRoster: isNewPermOrPartTime(employmentType) };
}

// Returns whether this save is a temp→perm conversion, so the calling UI
// can show the "go build their Standard Roster pattern" prompt.
export async function updateEmployeeAction(id: string, input: EmployeeInput): Promise<{ suggestStandardRoster: boolean }> {
  const actingUser = await requireAdmin();
  const employeeCode = input.employeeCode.trim();
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!employeeCode) throw new Error("Employee code is required");
  if (!firstName) throw new Error("First name is required");
  if (!lastName) throw new Error("Last name is required");
  const employmentType = parseEmploymentType(input.employmentType);
  const defaultShift = parseShift(input.defaultShift);

  const existing = await prisma.employee.findUnique({ where: { id } });
  if (!existing) throw new Error("Employee not found");

  const codeClash = await prisma.employee.findFirst({ where: { employeeCode, id: { not: id } } });
  if (codeClash) throw new Error("An employee with that code already exists");

  if (input.departmentId) {
    const dept = await prisma.department.findUnique({ where: { id: input.departmentId } });
    if (!dept) throw new Error("Department not found");
  }

  await prisma.$transaction(async (tx) => {
    await tx.employee.update({
      where: { id },
      data: {
        employeeCode,
        firstName,
        lastName,
        employmentType,
        agencyName: employmentType === EmploymentType.AGENCY ? input.agencyName?.trim() || null : null,
        departmentId: input.departmentId || null,
        defaultShift,
      },
    });
    await tx.auditLog.create({
      data: {
        entityType: "Employee",
        entityId: id,
        action: "UPDATE_EMPLOYEE",
        changes: {
          from: { employeeCode: existing.employeeCode, firstName: existing.firstName, lastName: existing.lastName, employmentType: existing.employmentType },
          to: { employeeCode, firstName, lastName, employmentType },
        },
        changedByUserId: actingUser.id,
      },
    });
  });

  refresh();
  return { suggestStandardRoster: isTempToPermConversion(existing.employmentType, employmentType) };
}

// Soft delete only — same isActive convention as Task/BreakRule/User. Every
// past StandardRoster/DailyRoster/TaskMovement row that already references
// this employee stays intact; they just stop appearing in the roster
// builder and casual pool.
export async function setEmployeeActiveAction(id: string, isActive: boolean) {
  const actingUser = await requireAdmin();

  const existing = await prisma.employee.findUnique({ where: { id } });
  if (!existing) throw new Error("Employee not found");

  await prisma.$transaction(async (tx) => {
    await tx.employee.update({ where: { id }, data: { isActive } });
    await tx.auditLog.create({
      data: {
        entityType: "Employee",
        entityId: id,
        action: isActive ? "REACTIVATE_EMPLOYEE" : "DEACTIVATE_EMPLOYEE",
        changes: { employeeCode: existing.employeeCode, name: `${existing.firstName} ${existing.lastName}` },
        changedByUserId: actingUser.id,
      },
    });
  });

  refresh();
}
