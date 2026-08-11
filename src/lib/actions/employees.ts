"use server";

import { refresh } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { EmploymentType, Shift } from "@/generated/prisma/client";
import { isNewPermOrPartTime, isTempToPermConversion } from "@/lib/employee-rules";
import { parseCsvRows } from "@/lib/csv-parse";

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

// ---------------------------------------------------------------------------
// Bulk upload — pasted tab-separated text (copied straight out of
// Excel/Sheets) or a plain CSV file's contents, one line per employee:
// Employee Code, First Name, Last Name, Employment Type, Agency, Department,
// Default Shift. Crucial for initial rollout (BACKLOG.md) — setting up
// 150+ real employees one-by-one through the modal isn't realistic.
//
// Matched by Employee Code (case-insensitive): a code that already exists
// updates that employee in place; a new one creates. isActive is never
// touched by this action either way — reactivating/deactivating stays its
// own deliberate action (setEmployeeActiveAction above), same as the
// single-row edit form never touches it.
//
// Same two-mode shape as bulkUploadStandardRosterAction
// (src/lib/actions/standard-roster.ts): commit=false only validates and
// returns a per-row report (the "Preview" step); commit=true re-parses/
// re-validates from the raw text and, only then, applies every row that
// comes back "ok" — the client is never trusted with previously-parsed rows.
// ---------------------------------------------------------------------------

export type BulkUploadEmployeeRowResult = {
  line: number;
  employeeCode: string;
  employeeName: string;
  employmentType: string;
  agencyName: string;
  departmentName: string;
  defaultShift: string;
  status: "ok" | "error";
  error?: string;
  isNew: boolean;
  // A new, or newly-converted, permanent/part-time employee — see
  // isNewPermOrPartTime/isTempToPermConversion above — needs a Standard
  // Roster pattern that a bulk upload of Employee rows can't set up itself
  // (that's its own bulk upload, on the Standard Roster screen). Surfaced
  // per-row and summarized after commit so nothing silently falls through.
  needsStandardRoster: boolean;
};

export type BulkUploadEmployeesResult = {
  rows: BulkUploadEmployeeRowResult[];
  validCount: number;
  errorCount: number;
  committed: boolean;
};

const EMPLOYEE_UPLOAD_COLUMNS = 7;

function employeeErrorRow(line: number, cells: string[], error: string): BulkUploadEmployeeRowResult {
  return {
    line,
    employeeCode: cells[0] ?? "",
    employeeName: [cells[1], cells[2]].filter((s) => s?.trim()).join(" "),
    employmentType: cells[3] ?? "",
    agencyName: cells[4] ?? "",
    departmentName: cells[5] ?? "",
    defaultShift: cells[6] ?? "",
    status: "error",
    error,
    isNew: false,
    needsStandardRoster: false,
  };
}

export async function bulkUploadEmployeesAction(rawText: string, commit: boolean): Promise<BulkUploadEmployeesResult> {
  const actingUser = await requireAdmin();

  const rawRows = parseCsvRows(rawText, "Employee Code");
  if (rawRows.length === 0) throw new Error("No rows to upload");

  const [existingEmployees, departments] = await Promise.all([
    prisma.employee.findMany(),
    prisma.department.findMany({ where: { isActive: true } }),
  ]);
  const existingByCode = new Map(existingEmployees.map((e) => [e.employeeCode.toLowerCase(), e]));
  const departmentByName = new Map(departments.map((d) => [d.name.toLowerCase(), d]));
  const departmentById = new Map(departments.map((d) => [d.id, d]));

  type ToApply = {
    existingId: string | null;
    employeeCode: string;
    firstName: string;
    lastName: string;
    employmentType: EmploymentType;
    agencyName: string | null;
    departmentId: string | null;
    defaultShift: Shift | null;
  };

  const results: BulkUploadEmployeeRowResult[] = [];
  const toApply: ToApply[] = [];
  const seenCodes = new Map<string, number>();

  rawRows.forEach((cells, idx) => {
    const line = idx + 1;
    if (cells.length < EMPLOYEE_UPLOAD_COLUMNS) {
      results.push(
        employeeErrorRow(
          line,
          cells,
          "Expected 7 columns: Employee Code, First Name, Last Name, Employment Type, Agency, Department, Default Shift"
        )
      );
      return;
    }
    const [codeRaw, firstNameRaw, lastNameRaw, typeRaw, agencyRaw, deptRaw, shiftRaw] = cells;

    const employeeCode = codeRaw.trim();
    if (!employeeCode) {
      results.push(employeeErrorRow(line, cells, "Employee code is required"));
      return;
    }
    const firstName = firstNameRaw.trim();
    const lastName = lastNameRaw.trim();
    if (!firstName || !lastName) {
      results.push(employeeErrorRow(line, cells, "First and last name are required"));
      return;
    }
    const employmentType = typeRaw.trim().toUpperCase();
    if (!EMPLOYMENT_TYPES.has(employmentType)) {
      results.push(employeeErrorRow(line, cells, `Invalid employment type "${typeRaw}"`));
      return;
    }

    let departmentId: string | null = null;
    if (deptRaw.trim()) {
      const dept = departmentByName.get(deptRaw.trim().toLowerCase());
      if (!dept) {
        results.push(employeeErrorRow(line, cells, `Unknown or inactive department "${deptRaw}"`));
        return;
      }
      departmentId = dept.id;
    }

    let defaultShift: Shift | null = null;
    if (shiftRaw.trim()) {
      const shiftUpper = shiftRaw.trim().toUpperCase();
      if (!SHIFTS.has(shiftUpper)) {
        results.push(employeeErrorRow(line, cells, `Invalid default shift "${shiftRaw}"`));
        return;
      }
      defaultShift = shiftUpper as Shift;
    }

    const key = employeeCode.toLowerCase();
    if (seenCodes.has(key)) {
      results.push(employeeErrorRow(line, cells, `Duplicate of line ${seenCodes.get(key)} in this upload`));
      return;
    }
    seenCodes.set(key, line);

    // Same "only meaningful for AGENCY" normalisation as create/update above
    // — silently dropped rather than an error, so a stray Agency column
    // value on a non-agency row doesn't block an otherwise-valid import.
    const agencyName = employmentType === EmploymentType.AGENCY ? agencyRaw.trim() || null : null;

    const existing = existingByCode.get(key) ?? null;
    const needsStandardRoster = existing
      ? isTempToPermConversion(existing.employmentType, employmentType as EmploymentType)
      : isNewPermOrPartTime(employmentType as EmploymentType);

    results.push({
      line,
      employeeCode,
      employeeName: `${firstName} ${lastName}`,
      employmentType,
      agencyName: agencyName ?? "",
      departmentName: departmentId ? (departmentById.get(departmentId)?.name ?? "") : "",
      defaultShift: defaultShift ?? "",
      status: "ok",
      isNew: !existing,
      needsStandardRoster,
    });
    toApply.push({
      existingId: existing?.id ?? null,
      employeeCode,
      firstName,
      lastName,
      employmentType: employmentType as EmploymentType,
      agencyName,
      departmentId,
      defaultShift,
    });
  });

  const validCount = results.filter((r) => r.status === "ok").length;
  const errorCount = results.length - validCount;

  if (!commit) {
    return { rows: results, validCount, errorCount, committed: false };
  }

  if (toApply.length > 0) {
    await prisma.$transaction(
      async (tx) => {
        for (const item of toApply) {
          if (item.existingId) {
            await tx.employee.update({
              where: { id: item.existingId },
              data: {
                employeeCode: item.employeeCode,
                firstName: item.firstName,
                lastName: item.lastName,
                employmentType: item.employmentType,
                agencyName: item.agencyName,
                departmentId: item.departmentId,
                defaultShift: item.defaultShift,
              },
            });
            await tx.auditLog.create({
              data: {
                entityType: "Employee",
                entityId: item.existingId,
                action: "BULK_UPLOAD_UPDATE_EMPLOYEE",
                changes: { employeeCode: item.employeeCode, employmentType: item.employmentType },
                changedByUserId: actingUser.id,
              },
            });
          } else {
            const created = await tx.employee.create({
              data: {
                employeeCode: item.employeeCode,
                firstName: item.firstName,
                lastName: item.lastName,
                employmentType: item.employmentType,
                agencyName: item.agencyName,
                departmentId: item.departmentId,
                defaultShift: item.defaultShift,
              },
            });
            await tx.auditLog.create({
              data: {
                entityType: "Employee",
                entityId: created.id,
                action: "BULK_UPLOAD_CREATE_EMPLOYEE",
                changes: { employeeCode: item.employeeCode, employmentType: item.employmentType },
                changedByUserId: actingUser.id,
              },
            });
          }
        }
      },
      // A whole-team import can be well over 100 rows — past Prisma's 5s
      // default, same reasoning as the live board's bulk actions.
      { timeout: 30_000 }
    );

    refresh();
  }

  return { rows: results, validCount, errorCount, committed: true };
}
