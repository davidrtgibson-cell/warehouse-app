"use client";

import { useEffect, useMemo, useState, useTransition, type DragEvent } from "react";
import { fmtTimeSydney } from "@/lib/format";
import { extendShiftAction, getMovementTimeline, getTaskTimeline, moveSelectedToTask } from "@/lib/actions/board";
import { MovementTimeRow, type TimelineMovement } from "@/components/MovementTimeRow";
import { formatDuration, formatTimeRange, plannedMinutesOnTask } from "@/lib/board-time";

// Set when an entry's own roster row belongs to a different shift than the
// one being viewed — "from" for OT still running past that shift's own
// finish (this shift is later than their own), "into" for someone starting
// early ahead of that shift's own start (this shift is earlier than their
// own). `shift` always names the person's own native shift, not the one
// being viewed.
export type Spillover = { direction: "from" | "into"; shift: "AM" | "PM" | "NIGHT" };

function SpilloverBadge({ spillover }: { spillover: Spillover }) {
  const title =
    spillover.direction === "from"
      ? `Overtime carried over from ${spillover.shift}`
      : `Started early, ahead of their ${spillover.shift} shift`;
  return (
    <span
      title={title}
      className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300"
    >
      OT · {spillover.direction} {spillover.shift}
    </span>
  );
}

type TaskMember = {
  id: string;
  dailyRosterId: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  startTime: Date;
  scheduledFinish: Date;
  actualFinish: Date | null;
  durationMinutes: number | null;
  status: "ACTIVE" | "CLOSED";
  spillover?: Spillover;
  // This movement's share of its employee's unpaid break, if any (native
  // rows only — see getTaskTimeline in lib/actions/board.ts). Subtracted
  // from the displayed minutes below so this modal's numbers can't disagree
  // with the task card's own already-net total.
  breakDeductionMinutes?: number;
};

function taskMemberMinutes(m: TaskMember) {
  const raw = m.status === "ACTIVE" ? plannedMinutesOnTask(m.startTime, m.scheduledFinish) : (m.durationMinutes ?? 0);
  return Math.max(0, raw - (m.breakDeductionMinutes ?? 0));
}

// Longest time-on-task first, alphabetical as a tiebreak — same ordering
// for both the currently-on-it and moved-on groups in the task detail card.
function sortTaskMembers(members: TaskMember[]) {
  return [...members].sort((a, b) => {
    const byMinutes = taskMemberMinutes(b) - taskMemberMinutes(a);
    if (byMinutes !== 0) return byMinutes;
    return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
  });
}

function TaskMemberLine({ member }: { member: TaskMember }) {
  const rangeText = member.actualFinish
    ? `${fmtTimeSydney(member.startTime)}–${fmtTimeSydney(member.actualFinish)}`
    : formatTimeRange(member.startTime, member.scheduledFinish);
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 text-xs">
      <div>
        <div className="flex items-center gap-1.5 text-sm font-medium">
          {member.firstName} {member.lastName}
          {member.spillover && <SpilloverBadge spillover={member.spillover} />}
        </div>
        <div className="text-zinc-500">{member.employeeCode}</div>
      </div>
      <div
        className="whitespace-nowrap font-mono text-zinc-500"
        title={
          member.breakDeductionMinutes
            ? `Net of ${formatDuration(member.breakDeductionMinutes)} unpaid break`
            : undefined
        }
      >
        {rangeText} · {formatDuration(taskMemberMinutes(member))}
      </div>
    </div>
  );
}

// Shared controls for "Extend Shift", used both inline (one person, in the
// detail modal) and in the bulk modal. An empty taskId means "keep current
// task" — the common case, where overtime just continues what they're
// already doing; picking a task closes the current movement and opens a
// new one on it, same as a live move, so overtime on different work is its
// own recorded movement.
function ExtendShiftFields({
  addableTasks,
  taskId,
  onTaskIdChange,
  finishTime,
  onFinishTimeChange,
  note,
  onNoteChange,
  disabled,
}: {
  addableTasks: AddableTask[];
  taskId: string;
  onTaskIdChange: (value: string) => void;
  finishTime: string;
  onFinishTimeChange: (value: string) => void;
  note: string;
  onNoteChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <select
        value={taskId}
        onChange={(e) => onTaskIdChange(e.target.value)}
        disabled={disabled}
        className="rounded border border-zinc-300 bg-white px-1.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950"
      >
        <option value="">Keep current task</option>
        {addableTasks.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <span className="text-xs text-zinc-500">until</span>
      <input
        type="time"
        value={finishTime}
        disabled={disabled}
        onChange={(e) => onFinishTimeChange(e.target.value)}
        className="rounded border border-zinc-300 bg-white px-1.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950"
      />
      <input
        type="text"
        placeholder="Reason (optional)"
        value={note}
        disabled={disabled}
        onChange={(e) => onNoteChange(e.target.value)}
        className="min-w-[8rem] flex-1 rounded border border-zinc-300 bg-white px-1.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950"
      />
    </div>
  );
}

export type BoardEntry = {
  dailyRosterId: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  departmentName: string | null;
  startTime: Date;
  scheduledFinish: Date;
  // Set when this entry is spilling in from an adjacent shift's roster row
  // (see BoardContent in src/app/page.tsx) rather than someone actually
  // rostered on this shift — startTime/scheduledFinish are already clamped
  // to this shift's own window, so they read like a normal entry; this is
  // purely so the board can flag "why is this person here."
  spillover?: Spillover;
  // This person's whole-shift gross minutes and applicable unpaid-break
  // minutes (native rows only — undefined for a spillover entry, whose
  // break is that adjacent shift's own concern). Shown as a gross/break/net
  // breakdown in the detail panel; NOT subtracted from this entry's own
  // displayed startTime/scheduledFinish range, which stays the raw fact of
  // when they were actually on this task — only card/shift totals are net.
  shiftGrossMinutes?: number;
  shiftBreakMinutes?: number;
};

export type BoardTaskGroup = {
  taskId: string;
  taskName: string;
  entries: BoardEntry[];
  // Sum of durationMinutes across CLOSED movements against this task on this
  // workDate+shift (people who've since moved off it) — the fixed part of
  // the card's total. The projected part (current entries' planned minutes
  // through their scheduledFinish) is added to this on the client.
  closedMinutesThisShift: number;
  // Total unpaid-break minutes attributed to this task this shift, summed
  // across everyone who worked it (see allocateBreakDeduction in
  // src/lib/break-rules.ts) — subtracted from the card's total below so a
  // task's reported hours never include someone's unpaid break time.
  breakDeductionMinutes: number;
};

export type AddableTask = { id: string; name: string };

export function LiveBoardGrid({
  taskGroups,
  addableTasks,
  disabled,
  workDateStr,
  shift,
  isLiveShift,
}: {
  taskGroups: BoardTaskGroup[];
  addableTasks: AddableTask[];
  disabled: boolean;
  workDateStr: string;
  shift: "AM" | "PM" | "NIGHT";
  isLiveShift: boolean;
}) {
  // Drag-and-drop is a "right now" gesture with no time picker — only
  // makes sense on the shift that's actually live at this moment, not one
  // being browsed for review/correction (those still have Move/Extend,
  // which do have explicit time controls).
  const dragEnabled = !disabled && isLiveShift;
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveTarget, setMoveTarget] = useState(addableTasks[0]?.id ?? "");
  // Tracks the live clock until the leader actually edits it — otherwise
  // this would freeze at whatever time it happened to be at mount (or at
  // the last move), reading further and further behind the real "now" the
  // longer the tab's been open. Editing the field, or a completed move,
  // hands control back to the leader/resets to live tracking respectively.
  const [moveAtTime, setMoveAtTime] = useState(() => fmtTimeSydney(new Date()));
  const [moveAtTouched, setMoveAtTouched] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ entry: BoardEntry } | null>(null);
  const [timeline, setTimeline] = useState<TimelineMovement[] | null>(null);

  useEffect(() => {
    if (moveAtTouched) return;
    const id = setInterval(() => setMoveAtTime(fmtTimeSydney(new Date())), 15_000);
    return () => clearInterval(id);
  }, [moveAtTouched]);

  function editMoveAtTime(value: string) {
    setMoveAtTime(value);
    setMoveAtTouched(true);
  }

  function resetMoveAtTimeToNow() {
    setMoveAtTime(fmtTimeSydney(new Date()));
    setMoveAtTouched(false);
  }

  useEffect(() => {
    if (!detail) return;
    let cancelled = false;
    getMovementTimeline(detail.entry.dailyRosterId).then((rows) => {
      if (!cancelled) setTimeline(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [detail]);

  function refetchTimeline() {
    if (!detail) return;
    getMovementTimeline(detail.entry.dailyRosterId).then(setTimeline);
  }

  // "Extend Shift" fields for the currently-open person — reset directly by
  // openDetail below (rather than an effect reacting to `detail` changing),
  // so the reset happens as part of the same click that opens the modal.
  const [extendTaskId, setExtendTaskId] = useState("");
  const [extendFinishTime, setExtendFinishTime] = useState("");
  const [extendNote, setExtendNote] = useState("");

  function openDetail(entry: BoardEntry) {
    setDetail({ entry });
    setExtendTaskId("");
    // Default guess is 2h past the currently scheduled finish, not the
    // finish itself — a leader extending shift almost always means "later
    // than this," so start them there; still just a starting point, the
    // field stays freely editable. Only when scheduledFinish is actually a
    // live boundary though (same check as formatTimeRange/
    // plannedMinutesOnTask elsewhere) — for someone already mid unplanned
    // overtime, scheduledFinish is stale/behind their own startTime, so
    // "+2h" off it lands in the past and the extend would silently no-op
    // server-side (newFinish <= approvedFinish). Leave it blank in that
    // case rather than default to a wrong, plausible-looking time.
    const hasLiveSchedule = entry.scheduledFinish.getTime() > entry.startTime.getTime();
    setExtendFinishTime(
      hasLiveSchedule ? fmtTimeSydney(new Date(entry.scheduledFinish.getTime() + 2 * 60 * 60 * 1000)) : ""
    );
    setExtendNote("");
  }

  function closeDetail() {
    setDetail(null);
    setTimeline(null);
  }

  const [taskDetail, setTaskDetail] = useState<{ taskId: string; taskName: string } | null>(null);
  const [taskTimeline, setTaskTimeline] = useState<TaskMember[] | null>(null);

  useEffect(() => {
    if (!taskDetail) return;
    let cancelled = false;
    getTaskTimeline(taskDetail.taskId, workDateStr, shift).then((rows) => {
      if (!cancelled) setTaskTimeline(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [taskDetail, workDateStr, shift]);

  function openTaskDetail(taskId: string, taskName: string) {
    setTaskDetail({ taskId, taskName });
  }

  function closeTaskDetail() {
    setTaskDetail(null);
    setTaskTimeline(null);
  }

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
        const result = await moveSelectedToTask(ids, taskId, moveAtTime);
        setMessage(`Moved ${result.moved} of ${ids.length}.`);
        setSelected(new Set());
        closeDetail();
        resetMoveAtTimeToNow();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Failed to move.");
      }
    });
  }

  // Same "Extend Shift" idea, bulk-scoped for the checkbox selection —
  // reset by openExtendBulk below when the modal opens.
  const [extendBulkOpen, setExtendBulkOpen] = useState(false);
  const [extendBulkTaskId, setExtendBulkTaskId] = useState("");
  const [extendBulkFinishTime, setExtendBulkFinishTime] = useState("");
  const [extendBulkNote, setExtendBulkNote] = useState("");

  function openExtendBulk() {
    setExtendBulkTaskId("");
    setExtendBulkFinishTime("");
    setExtendBulkNote("");
    setExtendBulkOpen(true);
  }

  function extendShift(ids: string[], taskId: string, finishTimeStr: string, note: string, onDone: () => void) {
    if (ids.length === 0 || !finishTimeStr) return;
    startTransition(async () => {
      try {
        const result = await extendShiftAction(ids, finishTimeStr, taskId || null, note.trim() || undefined);
        setMessage(`Extended ${result.extended} of ${ids.length}.`);
        onDone();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Failed to extend.");
      }
    });
  }

  // Native HTML5 drag-and-drop for one-at-a-time live moves — desktop only
  // (no touch support), which is fine for now. Reuses the exact same move()
  // as the checkbox/dropdown flow, so backdating, validation, and the
  // "Moved X of Y" message all keep working the same way regardless of how
  // the move was triggered.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);

  function handleDragStart(e: DragEvent, dailyRosterId: string) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dailyRosterId);
    setDraggingId(dailyRosterId);
  }

  function handleDragEnd() {
    setDraggingId(null);
    setDragOverTaskId(null);
  }

  function handleCardDragOver(e: DragEvent, taskId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverTaskId(taskId);
  }

  function handleCardDragLeave(e: DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverTaskId(null);
  }

  function handleCardDrop(e: DragEvent, taskId: string) {
    e.preventDefault();
    setDragOverTaskId(null);
    const dailyRosterId = e.dataTransfer.getData("text/plain");
    if (dailyRosterId) move([dailyRosterId], taskId);
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
          aria-label="Move selected to"
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
        <div className="flex items-center gap-1 text-xs text-zinc-500">
          <span>at</span>
          <input
            type="time"
            value={moveAtTime}
            disabled={disabled}
            onChange={(e) => editMoveAtTime(e.target.value)}
            className="rounded border border-zinc-300 bg-white px-1.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950"
          />
          <button
            type="button"
            disabled={disabled}
            onClick={resetMoveAtTimeToNow}
            className="underline decoration-dotted hover:decoration-solid disabled:cursor-not-allowed"
          >
            now
          </button>
        </div>
        <button
          type="button"
          disabled={disabled || isPending || selected.size === 0 || !moveTarget}
          onClick={() => move(Array.from(selected), moveTarget)}
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          {isPending ? "Moving…" : "Move selected"}
        </button>
        <button
          type="button"
          disabled={disabled || selected.size === 0}
          onClick={openExtendBulk}
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Extend shift
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
            const totalMinutes = Math.max(
              0,
              group.closedMinutesThisShift +
                group.entries.reduce((sum, e) => sum + plannedMinutesOnTask(e.startTime, e.scheduledFinish), 0) -
                group.breakDeductionMinutes
            );
            const allSelected = group.entries.every((e) => selected.has(e.dailyRosterId));
            return (
              <div
                key={group.taskId}
                onDragOver={(e) => dragEnabled && handleCardDragOver(e, group.taskId)}
                onDragLeave={handleCardDragLeave}
                onDrop={(e) => dragEnabled && handleCardDrop(e, group.taskId)}
                className={`flex flex-col rounded-lg border bg-white dark:bg-zinc-950 ${
                  dragOverTaskId === group.taskId
                    ? "border-zinc-900 border-dashed dark:border-zinc-100"
                    : "border-zinc-200 dark:border-zinc-800"
                }`}
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
                    <button
                      type="button"
                      onClick={() => openTaskDetail(group.taskId, group.taskName)}
                      title="Click to see everyone on this task today"
                      className="font-semibold hover:underline"
                    >
                      {group.taskName}
                    </button>
                  </div>
                  <div className="flex gap-2 text-xs text-zinc-500">
                    <span>{group.entries.length} people</span>
                    <span>·</span>
                    <span
                      title={
                        group.breakDeductionMinutes > 0
                          ? `Net of ${formatDuration(group.breakDeductionMinutes)} unpaid break`
                          : undefined
                      }
                    >
                      {formatDuration(totalMinutes)}
                    </span>
                  </div>
                </div>
                <div className="max-h-64 divide-y divide-zinc-200 overflow-y-auto dark:divide-zinc-800">
                  {group.entries.map((entry) => (
                    <div
                      key={entry.dailyRosterId}
                      draggable={dragEnabled}
                      onDragStart={(e) => handleDragStart(e, entry.dailyRosterId)}
                      onDragEnd={handleDragEnd}
                      className={`flex items-center gap-2 px-3 py-1.5 ${
                        draggingId === entry.dailyRosterId ? "opacity-40" : ""
                      } ${dragEnabled ? "cursor-grab active:cursor-grabbing" : ""}`}
                    >
                      <input
                        type="checkbox"
                        aria-label={`Select ${entry.firstName} ${entry.lastName}`}
                        checked={selected.has(entry.dailyRosterId)}
                        disabled={disabled}
                        onChange={() => toggle(entry.dailyRosterId)}
                      />
                      <button
                        type="button"
                        onClick={() => openDetail(entry)}
                        className="flex-1 text-left hover:underline"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-sm font-medium">
                            {entry.firstName} {entry.lastName}
                            {entry.spillover && <SpilloverBadge spillover={entry.spillover} />}
                          </div>
                          <div className="whitespace-nowrap font-mono text-xs text-zinc-500">
                            {formatTimeRange(entry.startTime, entry.scheduledFinish)}
                          </div>
                        </div>
                        <div className="text-xs text-zinc-500">
                          {entry.employeeCode} ·{" "}
                          {formatDuration(plannedMinutesOnTask(entry.startTime, entry.scheduledFinish))}
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
          onClick={closeDetail}
        >
          <div
            className="w-full max-w-sm rounded-lg bg-white p-4 shadow-lg dark:bg-zinc-950"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-1.5 font-semibold">
                  {detail.entry.firstName} {detail.entry.lastName}
                  {detail.entry.spillover && <SpilloverBadge spillover={detail.entry.spillover} />}
                </div>
                <div className="font-mono text-xs text-zinc-500">{detail.entry.employeeCode}</div>
              </div>
              <button
                type="button"
                onClick={closeDetail}
                className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="mt-2 flex justify-between text-sm">
              <span className="text-zinc-500">Department</span>
              <span>{detail.entry.departmentName ?? "—"}</span>
            </div>
            {detail.entry.shiftGrossMinutes !== undefined && (
              <div className="mt-1 flex justify-between text-sm">
                <span className="text-zinc-500">This shift</span>
                <span className="font-mono text-xs">
                  Gross {formatDuration(detail.entry.shiftGrossMinutes)}
                  {(detail.entry.shiftBreakMinutes ?? 0) > 0 && (
                    <>
                      {" "}· Break −{formatDuration(detail.entry.shiftBreakMinutes!)} · Net{" "}
                      {formatDuration(Math.max(0, detail.entry.shiftGrossMinutes - detail.entry.shiftBreakMinutes!))}
                    </>
                  )}
                </span>
              </div>
            )}

            <div className="mt-3 text-xs font-medium text-zinc-500">Today&apos;s tasks</div>
            {timeline === null ? (
              <div className="py-2 text-xs text-zinc-500">Loading…</div>
            ) : (
              <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {timeline.map((m) => (
                  <MovementTimeRow
                    key={m.id}
                    movement={m}
                    durationLabel={formatDuration(
                      m.status === "ACTIVE" ? plannedMinutesOnTask(m.startTime, m.scheduledFinish) : (m.durationMinutes ?? 0)
                    )}
                    disabled={disabled}
                    onSaved={refetchTimeline}
                  />
                ))}
              </div>
            )}

            <div className="mt-4 flex items-center gap-1 text-xs text-zinc-500">
              <span>Move at</span>
              <input
                type="time"
                value={moveAtTime}
                disabled={disabled}
                onChange={(e) => editMoveAtTime(e.target.value)}
                className="rounded border border-zinc-300 bg-white px-1.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950"
              />
              <button
                type="button"
                disabled={disabled}
                onClick={resetMoveAtTimeToNow}
                className="underline decoration-dotted hover:decoration-solid disabled:cursor-not-allowed"
              >
                now
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2">
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

            <div className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-800">
              <div className="text-xs font-medium text-zinc-500">Extend shift</div>
              <div className="mt-1 space-y-1">
                <ExtendShiftFields
                  addableTasks={addableTasks}
                  taskId={extendTaskId}
                  onTaskIdChange={setExtendTaskId}
                  finishTime={extendFinishTime}
                  onFinishTimeChange={setExtendFinishTime}
                  note={extendNote}
                  onNoteChange={setExtendNote}
                  disabled={disabled}
                />
                <button
                  type="button"
                  disabled={disabled || isPending || !extendFinishTime}
                  onClick={() =>
                    extendShift([detail.entry.dailyRosterId], extendTaskId, extendFinishTime, extendNote, closeDetail)
                  }
                  className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                >
                  Extend
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {taskDetail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeTaskDetail}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg bg-white p-4 shadow-lg dark:bg-zinc-950"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold">{taskDetail.taskName}</div>
                {taskTimeline !== null && (
                  <div className="text-xs text-zinc-500">
                    {formatDuration(taskTimeline.reduce((sum, m) => sum + taskMemberMinutes(m), 0))}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={closeTaskDetail}
                className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {taskTimeline === null ? (
              <div className="py-2 text-xs text-zinc-500">Loading…</div>
            ) : (
              (() => {
                const active = sortTaskMembers(taskTimeline.filter((m) => m.status === "ACTIVE"));
                const movedOn = sortTaskMembers(taskTimeline.filter((m) => m.status === "CLOSED"));
                return (
                  <div className="mt-3 min-h-0 flex-1 space-y-4 overflow-y-auto">
                    <div>
                      <div className="text-xs font-medium text-zinc-500">On this task now ({active.length})</div>
                      <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                        {active.length === 0 ? (
                          <div className="py-2 text-xs text-zinc-500">Nobody currently on this task.</div>
                        ) : (
                          active.map((m) => <TaskMemberLine key={m.id} member={m} />)
                        )}
                      </div>
                    </div>
                    {movedOn.length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-zinc-500">Moved on ({movedOn.length})</div>
                        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                          {movedOn.map((m) => (
                            <TaskMemberLine key={m.id} member={m} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()
            )}
          </div>
        </div>
      )}

      {extendBulkOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setExtendBulkOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-lg bg-white p-4 shadow-lg dark:bg-zinc-950"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div className="font-semibold">Extend shift for {selected.size} selected</div>
              <button
                type="button"
                onClick={() => setExtendBulkOpen(false)}
                className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              Only rows currently live are extended; anyone whose new finish isn&apos;t actually later than their
              current one is skipped.
            </p>
            <div className="mt-3 space-y-2">
              <ExtendShiftFields
                addableTasks={addableTasks}
                taskId={extendBulkTaskId}
                onTaskIdChange={setExtendBulkTaskId}
                finishTime={extendBulkFinishTime}
                onFinishTimeChange={setExtendBulkFinishTime}
                note={extendBulkNote}
                onNoteChange={setExtendBulkNote}
                disabled={disabled}
              />
              <button
                type="button"
                disabled={disabled || isPending || selected.size === 0 || !extendBulkFinishTime}
                onClick={() =>
                  extendShift(Array.from(selected), extendBulkTaskId, extendBulkFinishTime, extendBulkNote, () => {
                    setExtendBulkOpen(false);
                    setSelected(new Set());
                  })
                }
                className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                Extend
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
