"use client";

import { useMemo, useState, useTransition } from "react";
import {
  bulkUploadStandardRosterAction,
  endStandardRosterPatternAction,
  upsertStandardRosterRowAction,
  upsertStandardRosterWeekAction,
  type BulkUploadResult,
} from "@/lib/actions/standard-roster";
import { DayOfWeek, Shift, type EmploymentType } from "@/generated/prisma/enums";
import { formatEmploymentType } from "@/lib/roster-display";

export type StandardRosterEmployee = {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  employmentType: EmploymentType;
  agencyName: string | null;
  departmentName: string | null;
};

export type StandardRosterPattern = {
  id: string;
  employeeId: string;
  dayOfWeek: DayOfWeek;
  shift: Shift;
  startHHMM: string;
  finishHHMM: string;
  paidHours: number;
  taskId: string;
  taskName: string;
  effectiveFrom: string;
};

export type TaskOption = { id: string; name: string };

const DAY_LABELS: Record<DayOfWeek, string> = {
  MONDAY: "Mon",
  TUESDAY: "Tue",
  WEDNESDAY: "Wed",
  THURSDAY: "Thu",
  FRIDAY: "Fri",
  SATURDAY: "Sat",
  SUNDAY: "Sun",
};

const SHIFT_OPTIONS: Shift[] = [Shift.AM, Shift.PM, Shift.NIGHT];

// "For a full-time pattern" (BACKLOG.md's own framing) — Mon–Fri, not the
// weekend, is what the "default the rest of the week to match" streamlining
// applies to.
const WEEKDAYS: DayOfWeek[] = [
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
];

const CSV_TEMPLATE_HEADER = "Employee Code,Day,Shift,Start,Finish,Paid Hours,Task";
const CSV_EXAMPLE = `EMP-0001,MONDAY,AM,06:00,14:00,8,GTP Picking`;

function csvCell(value: string) {
  return value.includes(",") || value.includes('"') ? `"${value.replace(/"/g, '""')}"` : value;
}

function downloadTextFile(filename: string, contents: string) {
  const blob = new Blob([contents], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type EditingCell = {
  employee: StandardRosterEmployee;
  dayOfWeek: DayOfWeek;
  pattern: StandardRosterPattern | null;
};

export function StandardRosterGrid({
  employees,
  patterns,
  dayOrder,
  taskOptions,
  todayStr,
  disabled,
  initialSearch,
}: {
  employees: StandardRosterEmployee[];
  patterns: StandardRosterPattern[];
  dayOrder: DayOfWeek[];
  taskOptions: TaskOption[];
  todayStr: string;
  disabled: boolean;
  initialSearch?: string;
}) {
  const [search, setSearch] = useState(initialSearch ?? "");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");
  const [editing, setEditing] = useState<EditingCell | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const departments = useMemo(() => {
    const names = new Set<string>();
    for (const e of employees) if (e.departmentName) names.add(e.departmentName);
    return Array.from(names).sort();
  }, [employees]);

  const patternsByKey = useMemo(() => {
    const map = new Map<string, StandardRosterPattern>();
    for (const p of patterns) map.set(`${p.employeeId}:${p.dayOfWeek}`, p);
    return map;
  }, [patterns]);

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (departmentFilter !== "ALL" && e.departmentName !== departmentFilter) return false;
      if (!q) return true;
      return `${e.employeeCode} ${e.firstName} ${e.lastName}`.toLowerCase().includes(q);
    });
  }, [employees, search, departmentFilter]);

  function downloadCsv() {
    const lines = patterns.map((p) => {
      const employee = employees.find((e) => e.id === p.employeeId);
      return [
        employee?.employeeCode ?? "",
        p.dayOfWeek,
        p.shift,
        p.startHHMM,
        p.finishHHMM,
        String(p.paidHours),
        p.taskName,
      ]
        .map(csvCell)
        .join(",");
    });
    downloadTextFile(`standard-roster-${todayStr}.csv`, [CSV_TEMPLATE_HEADER, ...lines].join("\n"));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <input
          type="text"
          placeholder="Search name or code…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[180px] flex-1 rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        >
          <option value="ALL">All departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <span className="text-xs text-zinc-500">{filteredEmployees.length} employees</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={downloadCsv}
            className="rounded border border-zinc-300 px-3 py-1.5 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Download current pattern (CSV)
          </button>
          <button
            type="button"
            onClick={() => setShowUpload((v) => !v)}
            className="rounded border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            {showUpload ? "Hide bulk upload" : "Bulk upload"}
          </button>
        </div>
      </div>

      {showUpload && (
        <BulkUploadPanel disabled={disabled} todayStr={todayStr} onApplied={() => setShowUpload(false)} />
      )}

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-100 text-xs uppercase text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="whitespace-nowrap px-3 py-2">Employee</th>
              <th className="whitespace-nowrap px-3 py-2">Type</th>
              <th className="whitespace-nowrap px-3 py-2">Department</th>
              {dayOrder.map((d) => (
                <th key={d} className="whitespace-nowrap px-2 py-2 text-center">
                  {DAY_LABELS[d]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {filteredEmployees.length === 0 ? (
              <tr>
                <td colSpan={3 + dayOrder.length} className="px-3 py-6 text-center text-sm text-zinc-500">
                  No matching employees.
                </td>
              </tr>
            ) : (
              filteredEmployees.map((employee) => (
                <tr key={employee.id} className="bg-white align-top dark:bg-zinc-950">
                  <td className="whitespace-nowrap px-3 py-2">
                    <div className="font-medium">
                      {employee.firstName} {employee.lastName}
                    </div>
                    <div className="font-mono text-xs text-zinc-500">{employee.employeeCode}</div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">
                    {formatEmploymentType(employee.employmentType, employee.agencyName)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">
                    {employee.departmentName ?? "—"}
                  </td>
                  {dayOrder.map((day) => {
                    const pattern = patternsByKey.get(`${employee.id}:${day}`) ?? null;
                    return (
                      <td key={day} className="px-1.5 py-1.5 text-center">
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => setEditing({ employee, dayOfWeek: day, pattern })}
                          title={pattern ? "Click to edit this pattern" : "Click to add a pattern"}
                          className={
                            pattern
                              ? "block w-full rounded border border-zinc-300 px-1.5 py-1 text-left text-[11px] leading-tight hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                              : "block w-full rounded border border-dashed border-zinc-300 px-1.5 py-1 text-[11px] text-zinc-400 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                          }
                        >
                          {pattern ? (
                            <>
                              <div className="font-medium">
                                {pattern.shift} · {pattern.startHHMM}–{pattern.finishHHMM}
                              </div>
                              <div className="truncate text-zinc-500">{pattern.taskName}</div>
                            </>
                          ) : (
                            "+ Add"
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditPatternModal
          editing={editing}
          taskOptions={taskOptions}
          todayStr={todayStr}
          disabled={disabled}
          onClose={() => setEditing(null)}
          emptyWeekdays={WEEKDAYS.filter(
            (d) => d !== editing.dayOfWeek && !patternsByKey.has(`${editing.employee.id}:${d}`)
          )}
          hasAnyPatternForEmployee={patterns.some((p) => p.employeeId === editing.employee.id)}
        />
      )}
    </div>
  );
}

function EditPatternModal({
  editing,
  taskOptions,
  todayStr,
  disabled,
  onClose,
  emptyWeekdays,
  hasAnyPatternForEmployee,
}: {
  editing: EditingCell;
  taskOptions: TaskOption[];
  todayStr: string;
  disabled: boolean;
  onClose: () => void;
  emptyWeekdays: DayOfWeek[];
  hasAnyPatternForEmployee: boolean;
}) {
  const { employee, dayOfWeek, pattern } = editing;
  const [shift, setShift] = useState<Shift>(pattern?.shift ?? Shift.AM);
  const [start, setStart] = useState(pattern?.startHHMM ?? "06:00");
  const [finish, setFinish] = useState(pattern?.finishHHMM ?? "14:00");
  const [paidHours, setPaidHours] = useState(pattern ? String(pattern.paidHours) : "8");
  const [taskId, setTaskId] = useState(pattern?.taskId ?? taskOptions[0]?.id ?? "");
  const [effectiveFrom, setEffectiveFrom] = useState(todayStr);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Offered only when adding a brand-new pattern (not editing an existing
  // day) and there's at least one other weekday still empty to fill.
  // Streamlining per BACKLOG.md: entering the first day's shift defaults
  // the rest of the week to match, still editable per day afterward — so
  // this only pre-checks itself when this really is the employee's first
  // day being set up (hasAnyPatternForEmployee false); adding one more day
  // to an already-partially-set-up week defaults to off instead.
  const canCopyToWeek = !pattern && emptyWeekdays.length > 0;
  const [copyToWeek, setCopyToWeek] = useState(canCopyToWeek && !hasAnyPatternForEmployee);

  function save() {
    const hours = Number(paidHours);
    if (!Number.isFinite(hours) || hours <= 0) {
      setError("Paid hours must be greater than 0");
      return;
    }
    if (!taskId) {
      setError("Choose a task");
      return;
    }
    startTransition(async () => {
      try {
        const input = {
          employeeId: employee.id,
          dayOfWeek,
          shift,
          startTimeStr: start,
          finishTimeStr: finish,
          paidHours: hours,
          defaultTaskId: taskId,
          effectiveFromStr: effectiveFrom,
        };
        if (canCopyToWeek && copyToWeek) {
          await upsertStandardRosterWeekAction(input, emptyWeekdays);
        } else {
          await upsertStandardRosterRowAction(input);
        }
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    });
  }

  function endPattern() {
    startTransition(async () => {
      try {
        await endStandardRosterPatternAction(employee.id, dayOfWeek);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to end pattern");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="font-semibold">
              {employee.firstName} {employee.lastName}
            </div>
            <div className="text-xs text-zinc-500">
              {DAY_LABELS[dayOfWeek]} · {employee.employeeCode}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {pattern && (
          <p className="mt-2 text-xs text-zinc-500">
            Currently in effect from {pattern.effectiveFrom}. Saving below starts a new version from the date
            you choose — the old pattern is kept as history, not overwritten.
          </p>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="col-span-2 text-xs text-zinc-500">
            Shift
            <select
              value={shift}
              disabled={isPending}
              onChange={(e) => setShift(e.target.value as Shift)}
              className="mt-0.5 block w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              {SHIFT_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-zinc-500">
            Start
            <input
              type="time"
              value={start}
              disabled={isPending}
              onChange={(e) => setStart(e.target.value)}
              className="mt-0.5 block w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>
          <label className="text-xs text-zinc-500">
            Finish
            <input
              type="time"
              value={finish}
              disabled={isPending}
              onChange={(e) => setFinish(e.target.value)}
              className="mt-0.5 block w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>
          <label className="text-xs text-zinc-500">
            Paid hours
            <input
              type="number"
              step="0.25"
              min="0"
              value={paidHours}
              disabled={isPending}
              onChange={(e) => setPaidHours(e.target.value)}
              className="mt-0.5 block w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>
          <label className="text-xs text-zinc-500">
            Effective from
            <input
              type="date"
              value={effectiveFrom}
              disabled={isPending}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              className="mt-0.5 block w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>
          <label className="col-span-2 text-xs text-zinc-500">
            Task
            <select
              value={taskId}
              disabled={isPending}
              onChange={(e) => setTaskId(e.target.value)}
              className="mt-0.5 block w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              {taskOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {canCopyToWeek && (
          <label className="mt-3 flex items-start gap-2 rounded border border-zinc-200 bg-zinc-50 p-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            <input
              type="checkbox"
              checked={copyToWeek}
              disabled={isPending}
              onChange={(e) => setCopyToWeek(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Also apply this shift/time/task to the rest of the week ({emptyWeekdays.map((d) => DAY_LABELS[d]).join(", ")}
              ) — still editable per day afterward. Skips any day that already has a pattern.
            </span>
          </label>
        )}

        {error && <div className="mt-2 text-xs text-red-600">{error}</div>}

        <div className="mt-4 flex items-center justify-between gap-2">
          {pattern ? (
            <button
              type="button"
              disabled={disabled || isPending}
              onClick={endPattern}
              className="text-xs text-red-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400"
            >
              End this pattern (from today)
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            disabled={disabled || isPending}
            onClick={save}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            {isPending ? "Saving…" : canCopyToWeek && copyToWeek ? "Save for the week" : "Save from this date"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkUploadPanel({
  disabled,
  todayStr,
  onApplied,
}: {
  disabled: boolean;
  todayStr: string;
  onApplied: () => void;
}) {
  const [rawText, setRawText] = useState("");
  const [effectiveFromStr, setEffectiveFromStr] = useState(todayStr);
  const [result, setResult] = useState<BulkUploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setRawText(String(reader.result ?? ""));
    reader.readAsText(file);
    e.target.value = "";
  }

  function preview() {
    setError(null);
    startTransition(async () => {
      try {
        const r = await bulkUploadStandardRosterAction(rawText, effectiveFromStr, false);
        setResult(r);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to preview upload");
      }
    });
  }

  function confirmUpload() {
    setError(null);
    startTransition(async () => {
      try {
        const r = await bulkUploadStandardRosterAction(rawText, effectiveFromStr, true);
        setResult(r);
        onApplied();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to apply upload");
      }
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div>
        <h2 className="text-sm font-semibold">Bulk upload</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Paste tab-separated cells copied straight from Excel/Sheets, or upload a CSV file, with columns:{" "}
          <code className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-zinc-900">{CSV_TEMPLATE_HEADER}</code>. Example
          row: <code className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-zinc-900">{CSV_EXAMPLE}</code>. Every row
          shares one effective-from date below. This never overwrites existing rows — it only closes out and
          replaces the specific employee+day combinations present in your upload, versioned the same as a
          single-cell edit.
        </p>
      </div>

      <textarea
        rows={8}
        value={rawText}
        disabled={isPending}
        onChange={(e) => setRawText(e.target.value)}
        placeholder={`${CSV_TEMPLATE_HEADER}\n${CSV_EXAMPLE}`}
        className="w-full rounded border border-zinc-300 bg-white p-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-950"
      />

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={isPending}
          onChange={handleFile}
          className="text-xs"
        />
        <label className="flex items-center gap-1 text-xs text-zinc-500">
          Effective from
          <input
            type="date"
            value={effectiveFromStr}
            disabled={isPending}
            onChange={(e) => setEffectiveFromStr(e.target.value)}
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
        <button
          type="button"
          disabled={disabled || isPending || rawText.trim().length === 0}
          onClick={preview}
          className="rounded border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Preview
        </button>
        <button
          type="button"
          disabled={disabled || isPending || !result || result.committed || result.validCount === 0}
          onClick={confirmUpload}
          className="rounded border border-emerald-400 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
        >
          Confirm upload
        </button>
        {result && (
          <span className="text-xs text-zinc-500">
            {result.validCount} OK · {result.errorCount} error{result.errorCount === 1 ? "" : "s"}
            {result.committed && " · applied"}
          </span>
        )}
      </div>

      {error && <div className="text-xs text-red-600">{error}</div>}

      {result && result.rows.length > 0 && (
        <div className="max-h-64 overflow-auto rounded border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-zinc-100 uppercase text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-2 py-1">Line</th>
                <th className="px-2 py-1">Employee</th>
                <th className="px-2 py-1">Day</th>
                <th className="px-2 py-1">Shift</th>
                <th className="px-2 py-1">Hours</th>
                <th className="px-2 py-1">Task</th>
                <th className="px-2 py-1">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {result.rows.map((r) => (
                <tr key={r.line} className={r.status === "error" ? "bg-red-50 dark:bg-red-950/40" : "bg-white dark:bg-zinc-950"}>
                  <td className="px-2 py-1">{r.line}</td>
                  <td className="px-2 py-1">{r.employeeName ?? r.employeeCode}</td>
                  <td className="px-2 py-1">{r.dayOfWeek}</td>
                  <td className="px-2 py-1">{r.shift}</td>
                  <td className="px-2 py-1">
                    {r.start}–{r.finish}
                  </td>
                  <td className="px-2 py-1">{r.taskName}</td>
                  <td className="px-2 py-1">
                    {r.status === "ok" ? (
                      <span className="text-emerald-700 dark:text-emerald-400">{r.isNew ? "New" : "Update"}</span>
                    ) : (
                      <span className="text-red-700 dark:text-red-400">{r.error}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
