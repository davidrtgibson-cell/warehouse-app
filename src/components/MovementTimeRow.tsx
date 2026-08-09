"use client";

import { useState, useTransition } from "react";
import { fmtTimeSydney } from "@/lib/format";
import { updateMovementTimesAction } from "@/lib/actions/board";
import { formatTimeRange } from "@/lib/board-time";

export type TimelineMovement = {
  id: string;
  taskName: string;
  startTime: Date;
  scheduledFinish: Date;
  actualFinish: Date | null;
  durationMinutes: number | null;
  status: "ACTIVE" | "CLOSED";
};

// One row in a person's shift timeline (the live board's detail panel).
// Same click-to-edit interaction as InlineTimesCell.tsx on the Build Daily
// Roster screen — button showing the range, swaps to <input type="time">
// field(s) on click, saves on blur/Enter. A still-open movement only has a
// start to edit (no finish input); a closed one edits both.
export function MovementTimeRow({
  movement,
  durationLabel,
  disabled,
  onSaved,
}: {
  movement: TimelineMovement;
  durationLabel: string;
  disabled: boolean;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [start, setStart] = useState(fmtTimeSydney(movement.startTime));
  const [finish, setFinish] = useState(movement.actualFinish ? fmtTimeSydney(movement.actualFinish) : "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isClosed = movement.status === "CLOSED";

  function reset() {
    setStart(fmtTimeSydney(movement.startTime));
    setFinish(movement.actualFinish ? fmtTimeSydney(movement.actualFinish) : "");
    setError(null);
  }

  function cancel() {
    reset();
    setEditing(false);
  }

  function save() {
    const unchanged = start === fmtTimeSydney(movement.startTime) && (!isClosed || finish === fmtTimeSydney(movement.actualFinish!));
    if (unchanged) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      try {
        await updateMovementTimesAction(movement.id, start, isClosed ? finish : undefined);
        setError(null);
        setEditing(false);
        onSaved();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    });
  }

  // A still-open row shows its scheduled finish (the planned end used for
  // durationLabel too), not "ongoing" — see plannedMinutesOnTask in
  // board-time.ts for why this app no longer shows a live-ticking value.
  const rangeText = movement.actualFinish
    ? `${fmtTimeSydney(movement.startTime)}–${fmtTimeSydney(movement.actualFinish)}`
    : formatTimeRange(movement.startTime, movement.scheduledFinish);

  if (disabled) {
    return (
      <div className="flex items-center justify-between gap-2 py-1 text-xs">
        <span>{movement.taskName}</span>
        <span className="whitespace-nowrap font-mono text-zinc-500">
          {rangeText} · {durationLabel}
        </span>
      </div>
    );
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-2 py-1 text-xs">
        <span>{movement.taskName}</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          title="Click to correct these times"
          className="whitespace-nowrap font-mono text-zinc-500 underline decoration-dotted decoration-zinc-400 hover:decoration-solid"
        >
          {rangeText} · {durationLabel}
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-1 py-1 text-xs"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) save();
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span>{movement.taskName}</span>
        <div className="flex gap-1">
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
            className="w-24 rounded border border-zinc-300 bg-white px-1 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-950"
          />
          {isClosed && (
            <input
              type="time"
              value={finish}
              disabled={isPending}
              onChange={(e) => setFinish(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") cancel();
              }}
              className="w-24 rounded border border-zinc-300 bg-white px-1 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-950"
            />
          )}
        </div>
      </div>
      {error && <div className="text-[10px] text-red-600">{error}</div>}
    </div>
  );
}
