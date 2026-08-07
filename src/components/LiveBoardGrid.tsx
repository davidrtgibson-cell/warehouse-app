"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { fmtTimeSydney } from "@/lib/format";
import { moveSelectedToTask } from "@/lib/actions/board";

export type BoardEntry = {
  dailyRosterId: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  departmentName: string | null;
  startTime: Date;
};

export type BoardTaskGroup = {
  taskId: string;
  taskName: string;
  entries: BoardEntry[];
};

export type AddableTask = { id: string; name: string };

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function elapsedMinutes(start: Date, now: Date) {
  return Math.max(0, Math.floor((now.getTime() - start.getTime()) / 60000));
}

function formatDuration(totalMinutes: number) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function LiveBoardGrid({
  taskGroups,
  addableTasks,
  disabled,
}: {
  taskGroups: BoardTaskGroup[];
  addableTasks: AddableTask[];
  disabled: boolean;
}) {
  const now = useNow(15_000);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveTarget, setMoveTarget] = useState(addableTasks[0]?.id ?? "");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ entry: BoardEntry; taskName: string } | null>(null);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return taskGroups;
    return taskGroups
      .map((group) => ({
        ...group,
        entries: group.entries.filter((e) =>
          `${e.firstName} ${e.lastName} ${e.employeeCode}`.toLowerCase().includes(q)
        ),
      }))
      .filter((group) => group.entries.length > 0);
  }, [taskGroups, search]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(group: BoardTaskGroup) {
    const allSelected = group.entries.every((e) => selected.has(e.dailyRosterId));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const e of group.entries) {
        if (allSelected) next.delete(e.dailyRosterId);
        else next.add(e.dailyRosterId);
      }
      return next;
    });
  }

  function move(ids: string[], taskId: string) {
    if (ids.length === 0 || !taskId) return;
    startTransition(async () => {
      try {
        const result = await moveSelectedToTask(ids, taskId);
        setMessage(`Moved ${result.moved} of ${ids.length}.`);
        setSelected(new Set());
        setDetail(null);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Failed to move.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <input
          type="text"
          placeholder="Search name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[160px] flex-1 rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <span className="text-xs text-zinc-500">{selected.size} selected</span>
        <select
          value={moveTarget}
          onChange={(e) => setMoveTarget(e.target.value)}
          disabled={disabled}
          className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        >
          {addableTasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={disabled || isPending || selected.size === 0 || !moveTarget}
          onClick={() => move(Array.from(selected), moveTarget)}
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          {isPending ? "Moving…" : "Move selected"}
        </button>
        {message && <span className="text-xs text-zinc-500">{message}</span>}
      </div>

      {filteredGroups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No matches.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredGroups.map((group) => {
            const totalMinutes = group.entries.reduce((sum, e) => sum + elapsedMinutes(e.startTime, now), 0);
            const allSelected = group.entries.every((e) => selected.has(e.dailyRosterId));
            return (
              <div
                key={group.taskId}
                className="flex flex-col rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="flex items-center justify-between gap-2 border-b border-zinc-200 p-3 dark:border-zinc-800">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      disabled={disabled}
                      onChange={() => toggleGroup(group)}
                      aria-label={`Select all on ${group.taskName}`}
                    />
                    <h3 className="font-semibold">{group.taskName}</h3>
                  </div>
                  <div className="flex gap-2 text-xs text-zinc-500">
                    <span>{group.entries.length} people</span>
                    <span>·</span>
                    <span>{formatDuration(totalMinutes)} total</span>
                  </div>
                </div>
                <div className="max-h-64 divide-y divide-zinc-200 overflow-y-auto dark:divide-zinc-800">
                  {group.entries.map((entry) => (
                    <div key={entry.dailyRosterId} className="flex items-center gap-2 px-3 py-1.5">
                      <input
                        type="checkbox"
                        checked={selected.has(entry.dailyRosterId)}
                        disabled={disabled}
                        onChange={() => toggle(entry.dailyRosterId)}
                      />
                      <button
                        type="button"
                        onClick={() => setDetail({ entry, taskName: group.taskName })}
                        className="flex-1 text-left hover:underline"
                      >
                        <div className="text-sm font-medium">
                          {entry.firstName} {entry.lastName}
                        </div>
                        <div className="text-xs text-zinc-500">
                          {entry.employeeCode} · {formatDuration(elapsedMinutes(entry.startTime, now))}
                        </div>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {detail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setDetail(null)}
        >
          <div
            className="w-full max-w-sm rounded-lg bg-white p-4 shadow-lg dark:bg-zinc-950"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold">
                  {detail.entry.firstName} {detail.entry.lastName}
                </div>
                <div className="font-mono text-xs text-zinc-500">{detail.entry.employeeCode}</div>
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-zinc-500">Department</dt>
                <dd>{detail.entry.departmentName ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Current task</dt>
                <dd>{detail.taskName}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Started</dt>
                <dd className="font-mono">{fmtTimeSydney(detail.entry.startTime)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Time on task</dt>
                <dd className="font-mono font-medium">
                  {formatDuration(elapsedMinutes(detail.entry.startTime, now))}
                </dd>
              </div>
            </dl>
            <div className="mt-4 flex items-center gap-2">
              <select
                value={moveTarget}
                onChange={(e) => setMoveTarget(e.target.value)}
                disabled={disabled}
                className="flex-1 rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                {addableTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={disabled || isPending || !moveTarget}
                onClick={() => move([detail.entry.dailyRosterId], moveTarget)}
                className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                Move
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
