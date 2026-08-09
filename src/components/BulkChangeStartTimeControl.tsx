"use client";

import { useState, useTransition } from "react";
import { bulkChangeStartTimeAction, type BulkChangeStartTimeMode } from "@/lib/actions/roster";

// Bulk "bring several people's start earlier, extend several at once, or
// fix it after the fact" tool, next to "Mark selected absent" on the Build
// Roster screen. Shares that same checkbox selection via the `form`
// attribute (see SelectAllCheckbox for the same DOM-query pattern) rather
// than lifting the table into a client component.
//
// Start and finish are each independently optional — fill in just start
// (early start), just finish (extend, bulked), or both. Leaving one blank
// means "don't touch it" for an already-live row; for a not-yet-live row,
// mode decides whether the blank one stays fixed (Overtime) or moves along
// with the one you set (Shift change) — see bulkChangeStartTimeAction.
export function BulkChangeStartTimeControl({ formId, disabled }: { formId: string; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [finishTime, setFinishTime] = useState("");
  const [mode, setMode] = useState<BulkChangeStartTimeMode>("OVERTIME");
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function selectedIds(): string[] {
    const checkboxes = document.querySelectorAll<HTMLInputElement>(
      `input[type="checkbox"][form="${formId}"][name="dailyRosterId"]:checked`
    );
    return Array.from(checkboxes).map((cb) => cb.value);
  }

  function confirm() {
    const ids = selectedIds();
    if (ids.length === 0) {
      setMessage("Select at least one row first.");
      return;
    }
    if (!startTime && !finishTime) {
      setMessage("Enter a start time, a finish time, or both.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await bulkChangeStartTimeAction(
          ids,
          startTime || undefined,
          finishTime || undefined,
          mode,
          note.trim() || undefined
        );
        setMessage(
          result.skipped > 0
            ? `Changed ${result.changed} of ${ids.length} — ${result.skipped} skipped (no longer planned, or a live start/finish that wouldn't be valid).`
            : `Changed ${result.changed} of ${ids.length}.`
        );
        setOpen(false);
        setStartTime("");
        setFinishTime("");
        setNote("");
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Failed to change times.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="rounded border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        Change start/finish time
      </button>
      {open && (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-1">
            <input
              type="time"
              aria-label="New start time (optional)"
              value={startTime}
              disabled={disabled || isPending}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-32 rounded border border-zinc-300 bg-white px-1.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950"
            />
            <span className="text-xs text-zinc-500">–</span>
            <input
              type="time"
              aria-label="New finish time (optional)"
              value={finishTime}
              disabled={disabled || isPending}
              onChange={(e) => setFinishTime(e.target.value)}
              className="w-32 rounded border border-zinc-300 bg-white px-1.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950"
            />
            <select
              value={mode}
              disabled={disabled || isPending}
              onChange={(e) => setMode(e.target.value as BulkChangeStartTimeMode)}
              className="rounded border border-zinc-300 bg-white px-1.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="OVERTIME">Overtime</option>
              <option value="SHIFT_CHANGE">Shift change</option>
            </select>
            <input
              type="text"
              placeholder="Note (optional)"
              value={note}
              disabled={disabled || isPending}
              onChange={(e) => setNote(e.target.value)}
              className="w-40 rounded border border-zinc-300 bg-white px-1.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950"
            />
            <button
              type="button"
              disabled={disabled || isPending}
              onClick={confirm}
              className="rounded border border-zinc-300 px-2 py-1 text-xs font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              {isPending ? "Saving…" : "Confirm"}
            </button>
          </div>
          <p className="max-w-md text-[11px] text-zinc-500">
            Leave one blank to only change the other (e.g. finish only = extend the shift). For a
            not-yet-live row, the blank one stays fixed with Overtime, or moves with the one you set for
            Shift change. For an already-live row the blank one is always left exactly as it is.
          </p>
        </div>
      )}
      {message && <span className="text-xs text-zinc-500">{message}</span>}
    </div>
  );
}
