"use server";

import { refresh } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { DATE_RE, parseTimeString, timeValueFromHoursMinutes, todaySydneyDateString } from "@/lib/schedule";
import { addDaysToDateString, dateOnlyFromString, toDateOnlyString } from "@/lib/format";
import { DayOfWeek, Prisma, Shift, TaskCategory } from "@/generated/prisma/client";

type TxClient = Prisma.TransactionClient;

const DAY_VALUES = new Set<string>(Object.values(DayOfWeek));
const SHIFT_VALUES = new Set<string>(Object.values(Shift));

// "The open end of this employee+day's version chain" — the row still
// waiting to be superseded (effectiveTo null), regardless of whether its own
// effectiveFrom is in the past (currently live) or the future (already
// scheduled). Both single-row edits and bulk upload version against this,
// not just "what's active today" — editing an already-scheduled future
// change should still close *that* row, not create a second open-ended one.
async function findOpenRows(client: typeof prisma | TxClient, employeeId: string, dayOfWeek: DayOfWeek) {
  return client.standardRoster.findMany({
    where: { employeeId, dayOfWeek, effectiveTo: null, isActive: true },
  });
}

// ---------------------------------------------------------------------------
// Add or edit one employee+day pattern — never overwrites in place. Closes
// out the currently-open row for this employee+day (sets effectiveTo to the
// day before the new effectiveFrom) and inserts a fresh row, preserving
// history of what the pattern used to be.
// ---------------------------------------------------------------------------

export type StandardRosterRowInput = {
  employeeId: string;
  dayOfWeek: DayOfWeek;
  shift: Shift;
  startTimeStr: string;
  finishTimeStr: string;
  paidHours: number;
  defaultTaskId: string;
  effectiveFromStr: string;
};

// Shared by upsertStandardRosterRowAction and upsertStandardRosterWeekAction
// (the "copy to the rest of the week" streamlining) — one day's worth of
// the open-row-check-then-create-then-audit-log work, run inside a caller-
// supplied transaction so multiple days can commit atomically together.
async function upsertOneDay(
  tx: TxClient,
  actingUserId: string,
  employeeCode: string,
  taskName: string,
  input: StandardRosterRowInput,
  start: [number, number],
  finish: [number, number],
  effectiveFrom: Date
) {
  const openRows = await findOpenRows(tx, input.employeeId, input.dayOfWeek);
  for (const row of openRows) {
    if (row.effectiveFrom.getTime() >= effectiveFrom.getTime()) {
      throw new Error(
        `${input.dayOfWeek}: new pattern must start after the existing pattern's effective date (${toDateOnlyString(row.effectiveFrom)})`
      );
    }
  }

  if (openRows.length > 0) {
    const closeDate = dateOnlyFromString(addDaysToDateString(input.effectiveFromStr, -1));
    await tx.standardRoster.updateMany({
      where: { id: { in: openRows.map((r) => r.id) } },
      data: { effectiveTo: closeDate },
    });
  }

  const row = await tx.standardRoster.create({
    data: {
      employeeId: input.employeeId,
      dayOfWeek: input.dayOfWeek,
      shift: input.shift,
      startTime: timeValueFromHoursMinutes(start[0], start[1]),
      finishTime: timeValueFromHoursMinutes(finish[0], finish[1]),
      paidHours: input.paidHours,
      defaultTaskId: input.defaultTaskId,
      effectiveFrom,
      effectiveTo: null,
      isActive: true,
    },
  });

  await tx.auditLog.create({
    data: {
      entityType: "StandardRoster",
      entityId: row.id,
      action: openRows.length > 0 ? "UPDATE_STANDARD_ROSTER" : "CREATE_STANDARD_ROSTER",
      changes: {
        employeeCode,
        dayOfWeek: input.dayOfWeek,
        shift: input.shift,
        start: input.startTimeStr,
        finish: input.finishTimeStr,
        paidHours: input.paidHours,
        task: taskName,
        effectiveFrom: input.effectiveFromStr,
        replacedRowIds: openRows.map((r) => r.id),
      },
      changedByUserId: actingUserId,
    },
  });

  return row;
}

function validateRowInput(input: StandardRosterRowInput) {
  if (!DATE_RE.test(input.effectiveFromStr)) throw new Error("Invalid effective-from date");
  const start = parseTimeString(input.startTimeStr);
  const finish = parseTimeString(input.finishTimeStr);
  if (start[0] === finish[0] && start[1] === finish[1]) {
    throw new Error("Start and finish can't be the same time");
  }
  if (!(input.paidHours > 0)) throw new Error("Paid hours must be greater than 0");
  return { start, finish, effectiveFrom: dateOnlyFromString(input.effectiveFromStr) };
}

export async function upsertStandardRosterRowAction(input: StandardRosterRowInput) {
  const actingUser = await requireAdmin();
  const { start, finish, effectiveFrom } = validateRowInput(input);

  const employee = await prisma.employee.findFirst({ where: { id: input.employeeId, isActive: true } });
  if (!employee) throw new Error("Invalid employee");
  const task = await prisma.task.findFirst({
    where: { id: input.defaultTaskId, isActive: true, category: { not: TaskCategory.LEAVE } },
  });
  if (!task) throw new Error("Invalid task");

  const created = await prisma.$transaction((tx) =>
    upsertOneDay(tx, actingUser.id, employee.employeeCode, task.name, input, start, finish, effectiveFrom)
  );

  refresh();
  // Only plain, serializable data may cross back over the server-action
  // boundary to the client caller — the raw row carries a Decimal
  // (paidHours), which isn't. Callers here only need the id.
  return { id: created.id };
}

// The "entering the first day's shift time should default the rest of the
// week to match" streamlining (BACKLOG.md Tier 3 #1) — one atomic
// transaction covering the primary day plus every day in extraDays, all
// sharing the same shift/time/task/paidHours/effectiveFrom, rather than the
// client calling upsertStandardRosterRowAction once per day (which doesn't
// work reliably — see the comment on why below). All days succeed or none
// do, and one refresh() at the end rather than one per day.
//
// Deliberately NOT implemented client-side as N sequential calls to
// upsertStandardRosterRowAction: each call's own refresh() (a Server Action-
// only client-router refresh signal) interacts with React's transition
// scheduling in a way that silently abandons later awaits in the same
// startTransition — found the hard way, verified via a live browser session
// where a 5-day "copy to week" save appeared to succeed (modal closed, no
// error) but persisted nothing at all, not even the first day.
export async function upsertStandardRosterWeekAction(input: StandardRosterRowInput, extraDays: DayOfWeek[]) {
  const actingUser = await requireAdmin();
  const { start, finish, effectiveFrom } = validateRowInput(input);
  for (const day of extraDays) {
    if (!DAY_VALUES.has(day)) throw new Error(`Invalid day: ${day}`);
  }

  const employee = await prisma.employee.findFirst({ where: { id: input.employeeId, isActive: true } });
  if (!employee) throw new Error("Invalid employee");
  const task = await prisma.task.findFirst({
    where: { id: input.defaultTaskId, isActive: true, category: { not: TaskCategory.LEAVE } },
  });
  if (!task) throw new Error("Invalid task");

  const days = [input.dayOfWeek, ...extraDays.filter((d) => d !== input.dayOfWeek)];

  await prisma.$transaction(async (tx) => {
    for (const day of days) {
      await upsertOneDay(
        tx,
        actingUser.id,
        employee.employeeCode,
        task.name,
        { ...input, dayOfWeek: day },
        start,
        finish,
        effectiveFrom
      );
    }
  });

  refresh();
  return { days };
}

// ---------------------------------------------------------------------------
// Stop a pattern (person no longer works that day) — no replacement row.
// ---------------------------------------------------------------------------

export async function endStandardRosterPatternAction(
  employeeId: string,
  dayOfWeek: DayOfWeek,
  effectiveToStr?: string
) {
  if (effectiveToStr && !DATE_RE.test(effectiveToStr)) throw new Error("Invalid date");
  const actingUser = await requireAdmin();

  const openRows = await findOpenRows(prisma, employeeId, dayOfWeek);
  if (openRows.length === 0) throw new Error("No active pattern to end");

  const effectiveToDateStr = effectiveToStr ?? todaySydneyDateString();
  const effectiveTo = dateOnlyFromString(effectiveToDateStr);
  for (const row of openRows) {
    if (row.effectiveFrom.getTime() > effectiveTo.getTime()) {
      throw new Error(`Can't end this pattern before it starts (${toDateOnlyString(row.effectiveFrom)})`);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.standardRoster.updateMany({
      where: { id: { in: openRows.map((r) => r.id) } },
      data: { effectiveTo },
    });
    await tx.auditLog.create({
      data: {
        entityType: "StandardRoster",
        entityId: openRows[0].id,
        action: "END_STANDARD_ROSTER_PATTERN",
        changes: { dayOfWeek, effectiveTo: effectiveToDateStr },
        changedByUserId: actingUser.id,
      },
    });
  });

  refresh();
}

// ---------------------------------------------------------------------------
// Bulk upload — pasted tab-separated text (copied straight out of
// Excel/Sheets) or a plain CSV file's contents, one line per employee+day:
// Employee Code, Day, Shift, Start, Finish, Paid Hours, Task. Same
// close-old/open-new versioning as the single-row action above, all rows in
// the batch sharing one effective-from date. Never a destructive replace —
// only touches employee+day combinations actually present in the upload.
//
// One function, two modes, so the client is never trusted with previously-
// parsed rows: commit=false only validates and returns a per-row report
// (the "Preview" step); commit=true re-parses/re-validates from the raw
// text and, only then, applies every row that comes back "ok".
// ---------------------------------------------------------------------------

export type BulkUploadRowResult = {
  line: number;
  employeeCode: string;
  employeeName: string | null;
  dayOfWeek: string;
  shift: string;
  start: string;
  finish: string;
  paidHours: string;
  taskName: string;
  status: "ok" | "error";
  error?: string;
  isNew: boolean;
};

export type BulkUploadResult = {
  rows: BulkUploadRowResult[];
  validCount: number;
  errorCount: number;
  committed: boolean;
};

const EXPECTED_COLUMNS = 7;

function splitLine(line: string): string[] {
  const delimiter = line.includes("\t") ? "\t" : ",";
  return line.split(delimiter).map((cell) => cell.trim().replace(/^"(.*)"$/, "$1"));
}

function parseRawRows(rawText: string): string[][] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const rows = lines.map(splitLine);
  if (rows[0][0]?.toLowerCase() === "employee code") return rows.slice(1);
  return rows;
}

function errorRow(line: number, cells: string[], error: string): BulkUploadRowResult {
  return {
    line,
    employeeCode: cells[0] ?? "",
    employeeName: null,
    dayOfWeek: cells[1] ?? "",
    shift: cells[2] ?? "",
    start: cells[3] ?? "",
    finish: cells[4] ?? "",
    paidHours: cells[5] ?? "",
    taskName: cells[6] ?? "",
    status: "error",
    error,
    isNew: false,
  };
}

export async function bulkUploadStandardRosterAction(
  rawText: string,
  effectiveFromStr: string,
  commit: boolean
): Promise<BulkUploadResult> {
  const actingUser = await requireAdmin();
  if (!DATE_RE.test(effectiveFromStr)) throw new Error("Invalid effective-from date");
  const effectiveFrom = dateOnlyFromString(effectiveFromStr);

  const rawRows = parseRawRows(rawText);
  if (rawRows.length === 0) throw new Error("No rows to upload");

  const [employees, tasks, openRows] = await Promise.all([
    prisma.employee.findMany({ where: { isActive: true } }),
    prisma.task.findMany({ where: { isActive: true, category: { not: TaskCategory.LEAVE } } }),
    prisma.standardRoster.findMany({ where: { effectiveTo: null, isActive: true } }),
  ]);
  const employeeByCode = new Map(employees.map((e) => [e.employeeCode.toLowerCase(), e]));
  const taskByName = new Map(tasks.map((t) => [t.name.toLowerCase(), t]));
  const openByKey = new Map<string, typeof openRows>();
  for (const row of openRows) {
    const key = `${row.employeeId}:${row.dayOfWeek}`;
    const list = openByKey.get(key) ?? [];
    list.push(row);
    openByKey.set(key, list);
  }

  type ToApply = {
    key: string;
    employeeId: string;
    dayOfWeek: DayOfWeek;
    shift: Shift;
    start: [number, number];
    finish: [number, number];
    paidHours: number;
    taskId: string;
  };

  const results: BulkUploadRowResult[] = [];
  const toApply: ToApply[] = [];
  const seenKeys = new Map<string, number>();

  rawRows.forEach((cells, idx) => {
    const line = idx + 1;
    if (cells.length < EXPECTED_COLUMNS) {
      results.push(
        errorRow(line, cells, "Expected 7 columns: Employee Code, Day, Shift, Start, Finish, Paid Hours, Task")
      );
      return;
    }
    const [employeeCode, dayRaw, shiftRaw, startRaw, finishRaw, paidHoursRaw, taskNameRaw] = cells;

    const employee = employeeByCode.get(employeeCode.toLowerCase());
    if (!employee) {
      results.push(errorRow(line, cells, `Unknown or inactive employee code "${employeeCode}"`));
      return;
    }
    const dayOfWeek = dayRaw.toUpperCase();
    if (!DAY_VALUES.has(dayOfWeek)) {
      results.push(errorRow(line, cells, `Invalid day "${dayRaw}"`));
      return;
    }
    const shift = shiftRaw.toUpperCase();
    if (!SHIFT_VALUES.has(shift)) {
      results.push(errorRow(line, cells, `Invalid shift "${shiftRaw}"`));
      return;
    }
    let start: [number, number];
    let finish: [number, number];
    try {
      start = parseTimeString(startRaw);
      finish = parseTimeString(finishRaw);
    } catch {
      results.push(errorRow(line, cells, `Invalid start/finish time ("${startRaw}"/"${finishRaw}")`));
      return;
    }
    if (start[0] === finish[0] && start[1] === finish[1]) {
      results.push(errorRow(line, cells, "Start and finish can't be the same time"));
      return;
    }
    const paidHours = Number(paidHoursRaw);
    if (!Number.isFinite(paidHours) || paidHours <= 0) {
      results.push(errorRow(line, cells, `Invalid paid hours "${paidHoursRaw}"`));
      return;
    }
    const task = taskByName.get(taskNameRaw.toLowerCase());
    if (!task) {
      results.push(errorRow(line, cells, `Unknown or inactive task "${taskNameRaw}"`));
      return;
    }

    const key = `${employee.id}:${dayOfWeek}`;
    if (seenKeys.has(key)) {
      results.push(errorRow(line, cells, `Duplicate of line ${seenKeys.get(key)} in this upload`));
      return;
    }
    const existing = openByKey.get(key) ?? [];
    if (existing.some((r) => r.effectiveFrom.getTime() >= effectiveFrom.getTime())) {
      results.push(
        errorRow(line, cells, "An existing pattern for this employee+day already starts on or after this date")
      );
      return;
    }
    seenKeys.set(key, line);

    results.push({
      line,
      employeeCode: employee.employeeCode,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      dayOfWeek,
      shift,
      start: startRaw,
      finish: finishRaw,
      paidHours: String(paidHours),
      taskName: task.name,
      status: "ok",
      isNew: existing.length === 0,
    });
    toApply.push({
      key,
      employeeId: employee.id,
      dayOfWeek: dayOfWeek as DayOfWeek,
      shift: shift as Shift,
      start,
      finish,
      paidHours,
      taskId: task.id,
    });
  });

  const validCount = results.filter((r) => r.status === "ok").length;
  const errorCount = results.length - validCount;

  if (!commit) {
    return { rows: results, validCount, errorCount, committed: false };
  }

  if (toApply.length > 0) {
    const closeDate = dateOnlyFromString(addDaysToDateString(effectiveFromStr, -1));
    await prisma.$transaction(async (tx) => {
      for (const item of toApply) {
        const existing = openByKey.get(item.key) ?? [];
        if (existing.length > 0) {
          await tx.standardRoster.updateMany({
            where: { id: { in: existing.map((r) => r.id) } },
            data: { effectiveTo: closeDate },
          });
        }
        await tx.standardRoster.create({
          data: {
            employeeId: item.employeeId,
            dayOfWeek: item.dayOfWeek,
            shift: item.shift,
            startTime: timeValueFromHoursMinutes(item.start[0], item.start[1]),
            finishTime: timeValueFromHoursMinutes(item.finish[0], item.finish[1]),
            paidHours: item.paidHours,
            defaultTaskId: item.taskId,
            effectiveFrom,
            effectiveTo: null,
            isActive: true,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          entityType: "StandardRoster",
          entityId: effectiveFromStr,
          action: "BULK_UPLOAD_STANDARD_ROSTER",
          changes: { effectiveFrom: effectiveFromStr, applied: toApply.length, skipped: errorCount },
          changedByUserId: actingUser.id,
        },
      });
    });

    refresh();
  }

  return { rows: results, validCount, errorCount, committed: true };
}
