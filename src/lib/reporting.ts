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
  // The acting employee's own home department (Employee.departmentId) —
  // "show me hours for people who nominally belong to Inbound". Kept
  // distinct from taskDepartmentId below, which is the more meaningful cut
  // for "how many hours did Inbound's tasks actually consume" — someone
  // can be home-departed to Inbound and spend the shift on an Order
  // Fulfilment task, or vice versa.
  departmentId?: string;
  // The DEPARTMENT THE TASK BELONGS TO (Task.departmentId) — filters rows
  // by what the work was, not who nominally does it.
  taskDepartmentId?: string;
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
  // The employee's own home department (Employee.departmentId) — who they
  // nominally belong to, unrelated to what task this row is about.
  employeeDepartmentName: string | null;
  // The department THIS TASK belongs to (Task.departmentId) — what
  // reporting should roll department-level hours up by (see
  // summarizeByDepartment below), since a person's tasks during a shift
  // aren't bound by their own nominal department. Null for a task that
  // hasn't been assigned a department yet (see Task.departmentId's doc
  // comment in schema.prisma).
  taskDepartmentName: string | null;
  category: TaskCategory;
  // Only meaningful for LEAVE-category rows (see Task.isPaid's doc comment
  // in schema.prisma) — PRODUCTIVE/INDIRECT tasks are always true.
  isPaid: boolean;
  firstTaskStart: Date;
  lastTaskFinish: Date;
  // Per-TASK figures — genuinely additive. Summing taskNetMinutes across
  // one employee's rows for a single workDate+shift reproduces that
  // shift's own netWorkedMinutes exactly (break deduction is allocated
  // per-task by sumDeductionsByTask/break-rules.ts and never exceeds a
  // task's own gross minutes, so taskNetMinutes is never clamped in
  // practice — see computeEmployeeBreakAllocation's doc comment). These
  // are the columns reportRowsToCsv exports; safe to sum in a pivot table.
  taskGrossMinutes: number;
  taskBreakMinutes: number;
  taskNetMinutes: number;
  // Shift-level totals — the SAME value repeated on every task row for a
  // given employee+workDate+shift (this is the one place in this file
  // where the data is genuinely denormalised). Do NOT sum these across a
  // person's task rows — dedupe by employee+workDate+shift first, e.g. via
  // summarizeByPerson below, which the on-screen "By team member" view and
  // its Stat totals both already do. Deliberately EXCLUDED from
  // reportRowsToCsv's output for exactly this reason: a flat CSV with a
  // repeated dimension-level column is a pivot-table footgun (naively
  // summing "Net worked hours" across someone's 3 task rows would triple
  // their real shift hours). Kept on the row only because summarizeByPerson
  // needs them.
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
// touched during their shift. See ReportRow's own doc comment above for
// which fields are safe to sum across a person's rows (taskGross/Break/Net)
// versus which are shift-level and repeated (grossShiftMinutes and friends).
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
    include: { task: { include: { department: true } } },
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
      {
        taskName: string;
        taskDepartmentId: string | null;
        taskDepartmentName: string | null;
        category: TaskCategory;
        isPaid: boolean;
        firstStart: Date;
        lastFinish: Date;
        rawMinutes: number;
      }
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
          taskDepartmentId: m.task.departmentId,
          taskDepartmentName: m.task.department?.name ?? null,
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
      if (filters.taskDepartmentId && filters.taskDepartmentId !== task.taskDepartmentId) continue;
      const deduction = deductionByTask.get(taskId) ?? 0;
      rows.push({
        workDate: dateStr,
        shift: dailyRoster.shift,
        employeeName: `${dailyRoster.employee.firstName} ${dailyRoster.employee.lastName}`,
        employeeCode: dailyRoster.employee.employeeCode,
        employmentType: dailyRoster.employee.employmentType,
        agencyName: dailyRoster.employee.agencyName,
        taskName: task.taskName,
        employeeDepartmentName: dailyRoster.employee.department?.name ?? null,
        taskDepartmentName: task.taskDepartmentName,
        category: task.category,
        isPaid: task.isPaid,
        firstTaskStart: task.firstStart,
        lastTaskFinish: task.lastFinish,
        taskGrossMinutes: task.rawMinutes,
        taskBreakMinutes: deduction,
        taskNetMinutes: Math.max(0, task.rawMinutes - deduction),
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

// Deliberately only per-task (taskGross/Break/NetMinutes) columns here, not
// the shift-level grossShiftMinutes/unpaidBreakMinutes/netWorkedMinutes on
// ReportRow — those repeat per row and would silently inflate if summed in
// a pivot table (a real KPI-reporting bug: someone with 3 task rows in an
// 8h/7.5h-net shift would pivot-sum to 24h gross / 22.5h net). Every column
// below is safe to sum: grouping this CSV by employee+work date+shift and
// summing "Task net hours" reproduces that shift's real net worked hours
// exactly, because break deduction is allocated per-task (see
// ReportRow's own doc comment) rather than repeated whole.
const CSV_HEADERS = [
  "Work date",
  "Shift",
  "Employee",
  "Employee code",
  "Employment type",
  "Agency",
  "Task",
  "Task department",
  "Employee department",
  "Direct/Indirect",
  "Paid",
  "First task start",
  "Last task finish",
  "Task gross minutes",
  "Task gross hours",
  "Task break minutes",
  "Task net minutes",
  "Task net hours",
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
        row.taskDepartmentName ?? "",
        row.employeeDepartmentName ?? "",
        categoryLabel(row.category),
        row.isPaid ? "Yes" : "No",
        fmtTimeSydney(row.firstTaskStart),
        fmtTimeSydney(row.lastTaskFinish),
        row.taskGrossMinutes,
        (row.taskGrossMinutes / 60).toFixed(2),
        row.taskBreakMinutes,
        row.taskNetMinutes,
        (row.taskNetMinutes / 60).toFixed(2),
      ]
        .map(csvField)
        .join(",")
    );
  }
  return lines.join("\r\n") + "\r\n";
}

// Small on-screen summary helpers — group the same rows by task or by
// person for the preview toggle on /reports, without a second DB query.
// Sums taskNetMinutes (per-task, already net of that task's own break
// share) — safe to sum across rows/people, unlike the shift-level fields.
export function summarizeByTask(rows: ReportRow[]) {
  const map = new Map<
    string,
    {
      taskName: string;
      taskDepartmentName: string | null;
      category: TaskCategory;
      isPaid: boolean;
      people: Set<string>;
      netMinutes: number;
    }
  >();
  for (const row of rows) {
    const entry = map.get(row.taskName) ?? {
      taskName: row.taskName,
      taskDepartmentName: row.taskDepartmentName,
      category: row.category,
      isPaid: row.isPaid,
      people: new Set(),
      netMinutes: 0,
    };
    entry.people.add(row.employeeCode);
    entry.netMinutes += row.taskNetMinutes;
    map.set(row.taskName, entry);
  }
  return Array.from(map.values())
    .map((e) => ({
      taskName: e.taskName,
      taskDepartmentName: e.taskDepartmentName,
      category: e.category,
      isPaid: e.isPaid,
      peopleCount: e.people.size,
      netMinutes: e.netMinutes,
    }))
    .sort((a, b) => b.netMinutes - a.netMinutes);
}

// Department-level rollup — grouped by the TASK's department (see
// ReportRow.taskDepartmentName's doc comment above), not the acting
// employee's home department. A task with no department assigned yet
// (Task.departmentId still null — see its doc comment in schema.prisma)
// falls into the "No department" bucket rather than being silently
// dropped, so a gap in setup is visible here instead of just under-
// counting some other department's hours.
const NO_DEPARTMENT_LABEL = "No department";

export function summarizeByDepartment(rows: ReportRow[]) {
  const map = new Map<string, { departmentName: string; people: Set<string>; tasks: Set<string>; netMinutes: number }>();
  for (const row of rows) {
    const key = row.taskDepartmentName ?? NO_DEPARTMENT_LABEL;
    const entry = map.get(key) ?? { departmentName: key, people: new Set(), tasks: new Set(), netMinutes: 0 };
    entry.people.add(row.employeeCode);
    entry.tasks.add(row.taskName);
    entry.netMinutes += row.taskNetMinutes;
    map.set(key, entry);
  }
  return Array.from(map.values())
    .map((e) => ({
      departmentName: e.departmentName,
      peopleCount: e.people.size,
      taskCount: e.tasks.size,
      netMinutes: e.netMinutes,
    }))
    .sort((a, b) => b.netMinutes - a.netMinutes);
}

export function summarizeByPerson(rows: ReportRow[]) {
  // Net/gross/break are shift-level, so dedupe by employee+workDate+shift
  // before summing them (they're repeated on every task row for that shift).
  const shiftSeen = new Set<string>();
  const map = new Map<
    string,
    { employeeName: string; employeeCode: string; grossMinutes: number; breakMinutes: number; netMinutes: number }
  >();
  for (const row of rows) {
    const entry = map.get(row.employeeCode) ?? {
      employeeName: row.employeeName,
      employeeCode: row.employeeCode,
      grossMinutes: 0,
      breakMinutes: 0,
      netMinutes: 0,
    };
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
