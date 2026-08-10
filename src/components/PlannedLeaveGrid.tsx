"use client";

import { useMemo, useState, useTransition } from "react";
import { createPlannedLeaveAction, deletePlannedLeaveAction } from "@/lib/actions/planned-leave";

export type PlannedLeaveEmployee = { id: string; employeeCode: string; firstName: string; lastName: string };
export type LeaveTaskOption = { id: string; name: string; isPaid: boolean };
export type PlannedLeaveRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  taskId: string;
  taskName: string;
  dateFrom: string;
  dateTo: string;
};

function fieldClass() {
  return "rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950";
}

function AddPlannedLeaveForm({
  employees,
  taskOptions,
  todayStr,
}: {
  employees: PlannedLeaveEmployee[];
  taskOptions: LeaveTaskOption[];
  todayStr: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [taskId, setTaskId] = useState(taskOptions[0]?.id ?? "");
  const [dateFrom, setDateFrom] = useState(todayStr);
  const [dateTo, setDateTo] = useState(todayStr);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees.slice(0, 20);
    return employees.filter((e) => `${e.employeeCode} ${e.firstName} ${e.lastName}`.toLowerCase().includes(q)).slice(0, 20);
  }, [employees, search]);

  const selectedEmployee = employees.find((e) => e.id === employeeId) ?? null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        + Add planned leave
      </button>
    );
  }

  function submit() {
    if (!employeeId) {
      setError("Choose an employee");
      return;
    }
    if (!taskId) {
      setError("Choose a leave type");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await createPlannedLeaveAction(employeeId, taskId, dateFrom, dateTo);
        setOpen(false);
        setSearch("");
        setEmployeeId("");
        setDateFrom(todayStr);
        setDateTo(todayStr);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded border border-zinc-300 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900">
      <label className="text-xs text-zinc-500">
        Employee
        {selectedEmployee ? (
          <div className="mt-0.5 flex items-center justify-between gap-2 rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950">
            <span>
              {selectedEmployee.firstName} {selectedEmployee.lastName}{" "}
              <span className="font-mono text-xs text-zinc-500">{selectedEmployee.employeeCode}</span>
            </span>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setEmployeeId("")}
              className="text-xs text-zinc-500 hover:underline disabled:cursor-not-allowed"
            >
              Change
            </button>
          </div>
        ) : (
          <input
            type="text"
            placeholder="Search name or code…"
            value={search}
            disabled={isPending}
            onChange={(e) => setSearch(e.target.value)}
            className={`${fieldClass()} mt-0.5 block w-full`}
          />
        )}
      </label>
      {!selectedEmployee && search && (
        <div className="max-h-48 overflow-y-auto rounded border border-zinc-300 dark:border-zinc-700">
          {filteredEmployees.length === 0 ? (
            <div className="px-2 py-1.5 text-sm text-zinc-500">No matches</div>
          ) : (
            filteredEmployees.map((e) => (
              <button
                key={e.id}
                type="button"
                disabled={isPending}
                onClick={() => {
                  setEmployeeId(e.id);
                  setSearch("");
                }}
                className="block w-full px-2 py-1.5 text-left text-sm hover:bg-zinc-100 disabled:cursor-not-allowed dark:hover:bg-zinc-800"
              >
                {e.firstName} {e.lastName}{" "}
                <span className="font-mono text-xs text-zinc-500">({e.employeeCode})</span>
              </button>
            ))
          )}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        <label className="text-xs text-zinc-500">
          Leave type
          <select
            value={taskId}
            disabled={isPending}
            onChange={(e) => setTaskId(e.target.value)}
            className={`${fieldClass()} mt-0.5 block w-full`}
          >
            {taskOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {!t.isPaid && " (unpaid)"}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-500">
          From
          <input
            type="date"
            value={dateFrom}
            disabled={isPending}
            onChange={(e) => setDateFrom(e.target.value)}
            className={`${fieldClass()} mt-0.5 block w-full`}
          />
        </label>
        <label className="text-xs text-zinc-500">
          To
          <input
            type="date"
            value={dateTo}
            disabled={isPending}
            onChange={(e) => setDateTo(e.target.value)}
            className={`${fieldClass()} mt-0.5 block w-full`}
          />
        </label>
      </div>
      {error && <div className="text-xs text-red-600">{error}</div>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={submit}
          className="rounded border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        <button type="button" disabled={isPending} onClick={() => setOpen(false)} className="text-xs text-zinc-500 hover:underline">
          Cancel
        </button>
      </div>
    </div>
  );
}

function PlannedLeaveRowView({ row, todayStr }: { row: PlannedLeaveRow; todayStr: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isPast = row.dateTo < todayStr;

  function remove() {
    startTransition(async () => {
      try {
        await deletePlannedLeaveAction(row.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete");
      }
    });
  }

  return (
    <div className={`flex items-center justify-between gap-3 py-3 ${isPast ? "opacity-50" : ""}`}>
      <div>
        <div className="text-sm font-medium">
          {row.employeeName} <span className="font-mono text-xs text-zinc-500">{row.employeeCode}</span>
        </div>
        <div className="text-xs text-zinc-500">
          {row.taskName} · {row.dateFrom} → {row.dateTo}
          {isPast && " · past"}
        </div>
        {error && <div className="text-xs text-red-600">{error}</div>}
      </div>
      <button
        type="button"
        disabled={isPending}
        onClick={remove}
        className="rounded border border-zinc-300 px-2 py-0.5 text-xs hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        Remove
      </button>
    </div>
  );
}

export function PlannedLeaveGrid({
  rows,
  employees,
  taskOptions,
  todayStr,
}: {
  rows: PlannedLeaveRow[];
  employees: PlannedLeaveEmployee[];
  taskOptions: LeaveTaskOption[];
  todayStr: string;
}) {
  const sorted = [...rows].sort((a, b) => b.dateFrom.localeCompare(a.dateFrom));

  return (
    <div className="space-y-4">
      <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {sorted.length === 0 ? (
          <p className="py-3 text-sm text-zinc-500">No planned leave entered yet.</p>
        ) : (
          sorted.map((row) => <PlannedLeaveRowView key={row.id} row={row} todayStr={todayStr} />)
        )}
      </div>
      <AddPlannedLeaveForm employees={employees} taskOptions={taskOptions} todayStr={todayStr} />
    </div>
  );
}
