"use client";

import { useState, useTransition } from "react";
import { updateShiftWindowAction } from "@/lib/actions/settings";
import type { Shift } from "@/generated/prisma/enums";

export type ShiftWindowRow = { shift: Shift; startHHMM: string; finishHHMM: string };

export function ShiftHoursEditor({ windows, disabled }: { windows: ShiftWindowRow[]; disabled: boolean }) {
  return (
    <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
      {windows.map((w) => (
        <ShiftHoursRow key={w.shift} window={w} disabled={disabled} />
      ))}
    </div>
  );
}

// Same click-to-edit interaction as InlineTimesCell.tsx on the Build Daily
// Roster screen — button showing the range, swaps to two <input
// type="time"> fields on click, saves on blur/Enter/Escape.
function ShiftHoursRow({ window, disabled }: { window: ShiftWindowRow; disabled: boolean }) {
  const [editing, setEditing] = useState(false);
  const [start, setStart] = useState(window.startHHMM);
  const [finish, setFinish] = useState(window.finishHHMM);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStart(window.startHHMM);
    setFinish(window.finishHHMM);
    setError(null);
  }

  function cancel() {
    reset();
    setEditing(false);
  }

  function save() {
    if (start === window.startHHMM && finish === window.finishHHMM) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      try {
        await updateShiftWindowAction(window.shift, start, finish);
        setError(null);
        setEditing(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    });
  }

  const rangeText = `${window.startHHMM}–${window.finishHHMM}`;

  if (disabled) {
    return (
      <div className="flex items-center justify-between gap-3 py-3">
        <span className="w-16 text-sm font-medium">{window.shift}</span>
        <span className="font-mono text-sm">{rangeText}</span>
      </div>
    );
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-3 py-3">
        <span className="w-16 text-sm font-medium">{window.shift}</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          title="Click to change hours"
          className="font-mono text-sm underline decoration-dotted decoration-zinc-400 hover:decoration-solid"
        >
          {rangeText}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <span className="w-16 text-sm font-medium">{window.shift}</span>
      <div
        className="flex flex-col gap-1"
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) save();
        }}
      >
        <div className="flex items-center gap-1">
          <input
            type="time"
            autoFocus
            value={start}
            disabled={isPending}
            onChange={(e) => setStart(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") cancel();
            }}
            className="w-[6.5rem] rounded border border-zinc-300 bg-white px-1 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-950"
          />
          <span className="text-xs text-zinc-500">–</span>
          <input
            type="time"
            value={finish}
            disabled={isPending}
            onChange={(e) => setFinish(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") cancel();
            }}
            className="w-[6.5rem] rounded border border-zinc-300 bg-white px-1 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-950"
          />
        </div>
        {error && <div className="text-[10px] text-red-600">{error}</div>}
      </div>
    </div>
  );
}
