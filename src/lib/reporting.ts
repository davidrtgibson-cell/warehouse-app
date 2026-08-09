import { prisma } from "@/lib/db";
import { dateOnlyFromString, fmtTimeSydney, toDateOnlyString } from "@/lib/format";
import { getShiftWindows, sydneyInstant } from "@/lib/schedule";
import { elapsedMinutes } from "@/lib/board-time";
import { computeEmployeeBreakAllocation, sumDeductionsByTask, type MovementForBreakAllocation } from "@/lib/break-rules";
import { EmploymentType, Shift, TaskCategory } from "@/generated/prisma/client";

export type ReportFilters = {
  from: string; // "YYYY-MM-DD", inclusive
  to: string; // "YYYY-MM-DD", inclusive
  shift?: Shift;
  employeeId?: string;
  taskId?: string;
  departmentId?: string;
  employmentType?: EmploymentType;
  agencyName?: string;
};

export type ReportRow = {
  workDate: string;
  shift: Shift;
  employeeName: string;
  employeeCode: string;
  employmentType: EmploymentType;
  agencyName: string | null;
  taskName: string;
  departmentName: string | null;
  category: TaskCategory;
  // Only meaningful for LEAVE-category rows (see Task.isPaid's doc comment
  // in schema.prisma) — PRODUCTIVE/INDIRECT tasks are always true.
  isPaid: boolean;
  firstTaskStart: Date;
  lastTaskFinish: Date;
  rawTaskMinutes: number;
  grossShiftMinutes: number;
  unpaidBreakMinutes: number;
  netWorkedMinutes: number;
};

// The core labour-hours aggregation — used by both the on-screen report
// preview and the CSV export (src/app/reports/page.tsx,
// src/app/reports/export/route.ts) so the two can never show different
// numbers for the same filters.
//
// Row grain is (employee, workDate, shift, task) — one row per task someone
// touched during their shift, plus that shift's own gross/break/net columns
// repeated on every one of that shift's rows (a standard denormalised
// export shape: sum rawTaskMinutes to get task totals, dedupe by
// workDate+shift+employee to get shift-level totals).
//
// Gross hours here are each employee's WHOLE shift, uncapped — unlike the
// live board's clampToWindow model, which deliberately splits a movement
// across a shift-window boundary so two adjacent boards don't double-count
// the same minutes. A report row is "this person, this shift" — splitting
// one shift's hours across two rows because a movement happened to cross a
// shift-window boundary would make cost reconciliation harder, not easier.
// See PROJECT_BRIEF.md / the phase-5 plan for the fuller reasoning.
export async function buildLaborReportRows(filters: ReportFilters): Promise<ReportRow[]> {
  const fromDate = dateOnlyFromString(filters.from);
  const toDate = dateOnlyFromString(filters.to);

  const [shiftWindows, breakRules, dailyRosters] = await Promise.all([
    getShiftWindows(),
    prisma.breakRule.findMany({ where: { isActive: true } }),
    prisma.dailyRoster.findMany({
      where: {
        workDate: { gte: fromDate, lte: toDate },
        ...(filters.shift ? { shift: filters.shift } : {}),
        employee: {
          ...(filters.employeeId ? { id: filters.employeeId } : {}),
          ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
          ...(filters.employmentType ? { employmentType: filters.employmentType } : {}),
          ...(filters.agencyName ? { agencyName: filters.agencyName } : {}),
        },
      },
      include: { employee: { include: { department: true } } },
    }),
  ]);

  if (dailyRosters.length === 0) return [];

  const breakRuleTiers = breakRules.map((r) => ({
    isActive: r.isActive,
    minHoursWorked: Number(r.minHoursWorked),
    unpaidMinutes: r.unpaidMinutes,
  }));

  // Fetched unfiltered by task — a task filter narrows the OUTPUT rows
  // (below), but gross/break/net still need every movement for the shift.
  const movements = await prisma.taskMovement.findMany({
    where: { dailyRosterId: { in: dailyRosters.map((r) => r.id) } },
    include: { task: true },
    orderBy: { startTime: "asc" },
  });

  const movementsByRosterId = new Map<string, typeof movements>();
  for (const m of movements) {
    const list = movementsByRosterId.get(m.dailyRosterId) ?? [];
    list.push(m);
    movementsByRosterId.set(m.dailyRosterId, list);
  }

  const rows: ReportRow[] = [];

  for (const dailyRoster of dailyRosters) {
    const rosterMovements = movementsByRosterId.get(dailyRoster.id) ?? [];
    if (rosterMovements.length === 0) continue;

    // LEAVE-category movements are excluded from gross hours entirely — no
    // work happened, so no meal break was earned or missed against them
    // (they still get their own task-level row below, via rosterMovements,
    // just not counted toward this shift's gross/break/net columns).
    const forBreak: MovementForBreakAllocation[] = rosterMovements
      .filter((m) => m.task.category !== TaskCategory.LEAVE)
      .map((m) => ({
        id: m.id,
        taskId: m.taskId,
        startTime: m.startTime,
        effectiveFinish: m.actualFinish ?? m.scheduledFinish,
      }));

    const dateStr = toDateOnlyString(dailyRoster.workDate);
    const breakStartHM = shiftWindows[dailyRoster.shift].breakStart;
    const breakStartInstant = breakStartHM ? sydneyInstant(dateStr, breakStartHM[0], breakStartHM[1]) : null;
    const { grossMinutes, breakMinutes, perMovement } = computeEmployeeBreakAllocation(
      forBreak,
      breakStartInstant,
      breakRuleTiers
    );
    const deductionByTask = sumDeductionsByTask(forBreak, perMovement);

    const netMinutes = Math.max(0, grossMinutes - breakMinutes);

    // Sub-group this roster row's movements by task for the row-level columns.
    const byTask = new Map<
      string,
      { taskName: string; category: TaskCategory; isPaid: boolean; firstStart: Date; lastFinish: Date; rawMinutes: number }
    >();
    for (const m of rosterMovements) {
      const effectiveFinish = m.actualFinish ?? m.scheduledFinish;
      const minutes = elapsedMinutes(m.startTime, effectiveFinish);
      const existing = byTask.get(m.taskId);
      if (existing) {
        existing.rawMinutes += minutes;
        if (m.startTime < existing.firstStart) existing.firstStart = m.startTime;
        if (effectiveFinish > existing.lastFinish) existing.lastFinish = effectiveFinish;
      } else {
        byTask.set(m.taskId, {
          taskName: m.task.name,
          category: m.task.category,
          isPaid: m.task.isPaid,
          firstStart: m.startTime,
          lastFinish: effectiveFinish,
          rawMinutes: minutes,
        });
      }
    }

    for (const [taskId, task] of byTask) {
      if (filters.taskId && filters.taskId !== taskId) continue;
      const deduction = deductionByTask.get(taskId) ?? 0;
      rows.push({
        workDate: dateStr,
        shift: dailyRoster.shift,
        employeeName: `${dailyRoster.employee.firstName} ${dailyRoster.employee.lastName}`,
        employeeCode: dailyRoster.employee.employeeCode,
        employmentType: dailyRoster.employee.employmentType,
        agencyName: dailyRoster.employee.agencyName,
        taskName: task.taskName,
        departmentName: dailyRoster.employee.department?.name ?? null,
        category: task.category,
        isPaid: task.isPaid,
        firstTaskStart: task.firstStart,
        lastTaskFinish: task.lastFinish,
        rawTaskMinutes: Math.max(0, task.rawMinutes - deduction),
        grossShiftMinutes: grossMinutes,
        unpaidBreakMinutes: breakMinutes,
        netWorkedMinutes: netMinutes,
      });
    }
  }

  rows.sort((a, b) => a.workDate.localeCompare(b.workDate) || a.employeeName.localeCompare(b.employeeName));
  return rows;
}

function categoryLabel(category: TaskCategory): string {
  if (category === TaskCategory.PRODUCTIVE) return "Direct";
  if (category === TaskCategory.INDIRECT) return "Indirect";
  return "Leave";
}

function csvField(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const CSV_HEADERS = [
  "Work date",
  "Shift",
  "Employee",
  "Employee code",
  "Employment type",
  "Agency",
  "Task",
  "Department",
  "Direct/Indirect",
  "Paid",
  "First task start",
  "Last task finish",
  "Raw task minutes",
  "Raw task hours",
  "Gross shift hours",
  "Unpaid break minutes",
  "Net worked hours",
];

export function reportRowsToCsv(rows: ReportRow[]): string {
  const lines = [CSV_HEADERS.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.workDate,
        row.shift,
        row.employeeName,
        row.employeeCode,
        row.employmentType,
        row.agencyName ?? "",
        row.taskName,
        row.departmentName ?? "",
        categoryLabel(row.category),
        row.isPaid ? "Yes" : "No",
        fmtTimeSydney(row.firstTaskStart),
        fmtTimeSydney(row.lastTaskFinish),
        row.rawTaskMinutes,
        (row.rawTaskMinutes / 60).toFixed(2),
        (row.grossShiftMinutes / 60).toFixed(2),
        row.unpaidBreakMinutes,
        (row.netWorkedMinutes / 60).toFixed(2),
      ]
        .map(csvField)
        .join(",")
    );
  }
  return lines.join("\r\n") + "\r\n";
}

// Small on-screen summary helpers — group the same rows by task or by
// person for the preview toggle on /reports, without a second DB query.
export function summarizeByTask(rows: ReportRow[]) {
  const map = new Map<
    string,
    { taskName: string; category: TaskCategory; isPaid: boolean; people: Set<string>; rawMinutes: number }
  >();
  for (const row of rows) {
    const entry = map.get(row.taskName) ?? {
      taskName: row.taskName,
      category: row.category,
      isPaid: row.isPaid,
      people: new Set(),
      rawMinutes: 0,
    };
    entry.people.add(row.employeeCode);
    entry.rawMinutes += row.rawTaskMinutes;
    map.set(row.taskName, entry);
  }
  return Array.from(map.values())
    .map((e) => ({ taskName: e.taskName, category: e.category, isPaid: e.isPaid, peopleCount: e.people.size, rawMinutes: e.rawMinutes }))
    .sort((a, b) => b.rawMinutes - a.rawMinutes);
}

export function summarizeByPerson(rows: ReportRow[]) {
  // Net/gross/break are shift-level, so dedupe by employee+workDate+shift
  // before summing them (they're repeated on every task row for that shift).
  const shiftSeen = new Set<string>();
  const map = new Map<
    string,
    { employeeName: string; employeeCode: string; grossMinutes: number; breakMinutes: number; netMinutes: number; rawMinutes: number }
  >();
  for (const row of rows) {
    const entry = map.get(row.employeeCode) ?? {
      employeeName: row.employeeName,
      employeeCode: row.employeeCode,
      grossMinutes: 0,
      breakMinutes: 0,
      netMinutes: 0,
      rawMinutes: 0,
    };
    entry.rawMinutes += row.rawTaskMinutes;
    const shiftKey = `${row.employeeCode}:${row.workDate}:${row.shift}`;
    if (!shiftSeen.has(shiftKey)) {
      shiftSeen.add(shiftKey);
      entry.grossMinutes += row.grossShiftMinutes;
      entry.breakMinutes += row.unpaidBreakMinutes;
      entry.netMinutes += row.netWorkedMinutes;
    }
    map.set(row.employeeCode, entry);
  }
  return Array.from(map.values()).sort((a, b) => b.netMinutes - a.netMinutes);
}
