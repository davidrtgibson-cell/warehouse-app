"use client";

import { useMemo, useState, useTransition } from "react";
import { addCasualToRoster } from "@/lib/actions/roster";
import { Shift, type EmploymentType, type TaskCategory } from "@/generated/prisma/enums";

export type PoolEmployee = {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  employmentType: EmploymentType;
  agencyName: string | null;
  defaultShift: Shift | null;
  departmentName: string | null;
};

export type TaskOption = { id: string; name: string; category: TaskCategory };

const SHIFT_OPTIONS: Shift[] = [Shift.AM, Shift.PM, Shift.NIGHT];

type SortKey = "name" | "type" | "department";
const SORTERS: Record<SortKey, (a: PoolEmployee, b: PoolEmployee) => number> = {
  name: (a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`),
  type: (a, b) => a.employmentType.localeCompare(b.employmentType),
  department: (a, b) => (a.departmentName ?? "").localeCompare(b.departmentName ?? ""),
};

function employmentTypeLabel(type: EmploymentType, agencyName: string | null) {
  const label = type.replace("_", " ").toLowerCase();
  const capitalized = label.charAt(0).toUpperCase() + label.slice(1);
  return agencyName ? `${capitalized} — ${agencyName}` : capitalized;
}

function SortableHeader({
  label,
  sortKey,
  active,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  dir: "asc" | "desc";
  onSort: (key: SortKey) => void;
}) {
  const isActive = active === sortKey;
  return (
    <th className="px-3 py-2">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 hover:underline"
      >
        {label}
        {isActive && <span aria-hidden>{dir === "asc" ? "▲" : "▼"}</span>}
      </button>
    </th>
  );
}

export function CasualPoolPanel({
  dateStr,
  employees,
  tasks,
  disabled,
  defaultShiftFilter,
}: {
  dateStr: string;
  employees: PoolEmployee[];
  tasks: TaskOption[];
  disabled: boolean;
  defaultShiftFilter?: Shift;
}) {
  const [search, setSearch] = useState("");
  const [shiftFilter, setShiftFilter] = useState<Shift | "ALL">(defaultShiftFilter ?? "ALL");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rowShift, setRowShift] = useState<Record<string, Shift>>({});
  const [taskId, setTaskId] = useState(tasks[0]?.id ?? "");
  // Batch-level, not per-row — matches the single shared "assign task"
  // control below. Each person still gets an AM/PM/NIGHT bucket from their
  // own Shift column (for live-board grouping/finalize); this only
  // overrides the *hours*, for things like a one-off 10am-6pm mid-shift.
  const [useCustomHours, setUseCustomHours] = useState(false);
  const [customStart, setCustomStart] = useState("10:00");
  const [customFinish, setCustomFinish] = useState("18:00");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (shiftFilter !== "ALL" && e.defaultShift !== shiftFilter) return false;
      if (!q) return true;
      const haystack = `${e.employeeCode} ${e.firstName} ${e.lastName}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [employees, search, shiftFilter]);

  const sorted = useMemo(() => {
    const list = [...filtered].sort(SORTERS[sortKey]);
    if (sortDir === "desc") list.reverse();
    return list;
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function shiftFor(employee: PoolEmployee) {
    return rowShift[employee.id] ?? employee.defaultShift ?? Shift.AM;
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllFiltered() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const e of filtered) next.add(e.id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function handleAdd() {
    if (selectedIds.size === 0 || !taskId) return;
    if (useCustomHours && customStart === customFinish) {
      setMessage("Custom start and finish can't be the same time.");
      return;
    }
    const entries = Array.from(selectedIds).map((id) => {
      const employee = employees.find((e) => e.id === id);
      return { employeeId: id, shift: employee ? shiftFor(employee) : Shift.AM };
    });
    const customHours = useCustomHours ? { startTimeStr: customStart, finishTimeStr: customFinish } : undefined;

    startTransition(async () => {
      try {
        const result = await addCasualToRoster(dateStr, taskId, entries, customHours);
        const hoursNote = useCustomHours ? ` (${customStart}–${customFinish})` : "";
        setMessage(`Added ${result.created} of ${entries.length} selected to the roster${hoursNote}.`);
        setSelectedIds(new Set());
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Failed to add to roster.");
      }
    });
  }

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 p-3 dark:border-zinc-800">
        <input
          type="text"
          placeholder="Search name or code…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[160px] rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <select
          value={shiftFilter}
          onChange={(e) => setShiftFilter(e.target.value as Shift | "ALL")}
          className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        >
          <option value="ALL">All shifts</option>
          {SHIFT_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={selectAllFiltered}
          className="rounded border border-zinc-300 px-2 py-1.5 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Select all shown
        </button>
        <button
          type="button"
          onClick={clearSelection}
          className="rounded border border-zinc-300 px-2 py-1.5 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Clear
        </button>
        <span className="text-xs text-zinc-500">
          {filtered.length} in pool · {selectedIds.size} selected
        </span>
      </div>

      <div className="max-h-96 overflow-y-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-zinc-100 text-xs uppercase text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="w-8 px-3 py-2" />
              <SortableHeader label="Employee" sortKey="name" active={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHeader label="Type" sortKey="type" active={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHeader
                label="Department"
                sortKey="department"
                active={sortKey}
                dir={sortDir}
                onSort={toggleSort}
              />
              <th className="px-3 py-2">Shift</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-zinc-500">
                  No matching employees.
                </td>
              </tr>
            ) : (
              sorted.map((e) => (
                <tr key={e.id} className="bg-white dark:bg-zinc-950">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(e.id)}
                      onChange={() => toggleSelected(e.id)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium">
                      {e.firstName} {e.lastName}
                    </div>
                    <div className="font-mono text-xs text-zinc-500">{e.employeeCode}</div>
                  </td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                    {employmentTypeLabel(e.employmentType, e.agencyName)}
                  </td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{e.departmentName ?? "—"}</td>
                  <td className="px-3 py-2">
                    <select
                      value={shiftFor(e)}
                      onChange={(ev) =>
                        setRowShift((prev) => ({ ...prev, [e.id]: ev.target.value as Shift }))
                      }
                      className="rounded border border-zinc-300 bg-white px-1.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950"
                    >
                      {SHIFT_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200 p-3 dark:border-zinc-800">
        <label className="text-xs text-zinc-500" htmlFor="casual-task">
          Assign task
        </label>
        <select
          id="casual-task"
          value={taskId}
          onChange={(e) => setTaskId(e.target.value)}
          className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        >
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-xs text-zinc-500">
          <input
            type="checkbox"
            checked={useCustomHours}
            onChange={(e) => setUseCustomHours(e.target.checked)}
          />
          Custom hours
        </label>
        {useCustomHours && (
          <div className="flex items-center gap-1">
            <input
              type="time"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="w-[6.5rem] rounded border border-zinc-300 bg-white px-1.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950"
            />
            <span className="text-xs text-zinc-500">–</span>
            <input
              type="time"
              value={customFinish}
              onChange={(e) => setCustomFinish(e.target.value)}
              className="w-[6.5rem] rounded border border-zinc-300 bg-white px-1.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950"
            />
          </div>
        )}
        <button
          type="button"
          disabled={disabled || isPending || selectedIds.size === 0 || !taskId}
          onClick={handleAdd}
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          {isPending ? "Adding…" : `Add ${selectedIds.size || ""} to roster`}
        </button>
        {message && <span className="text-xs text-zinc-500">{message}</span>}
        {disabled && (
          <span className="text-xs text-amber-600 dark:text-amber-400">
            Select an acting user above to add employees.
          </span>
        )}
        {useCustomHours && (
          <p className="w-full text-[11px] text-zinc-500">
            Each person still gets an AM/PM/NIGHT bucket from the Shift column above (for board grouping) —
            actual planned hours come from the custom window here.
          </p>
        )}
      </div>
    </div>
  );
}
