"use client";

import { useState, useTransition } from "react";
import { updateRosterTimesAction } from "@/lib/actions/roster";

function minutesOf(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function deviates(hhmm: string, standardMinutes: number | null) {
  if (standardMinutes === null) return false;
  return Math.abs(minutesOf(hhmm) - standardMinutes) > 15;
}

export function InlineTimesCell({
  dailyRosterId,
  plannedStartHHMM,
  plannedFinishHHMM,
  standardStartMinutes,
  standardFinishMinutes,
  disabled,
}: {
  dailyRosterId: string;
  plannedStartHHMM: string;
  plannedFinishHHMM: string;
  standardStartMinutes: number | null;
  standardFinishMinutes: number | null;
  disabled: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [start, setStart] = useState(plannedStartHHMM);
  const [finish, setFinish] = useState(plannedFinishHHMM);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const needsReason = deviates(start, standardStartMinutes) || deviates(finish, standardFinishMinutes);

  function reset() {
    setStart(plannedStartHHMM);
    setFinish(plannedFinishHHMM);
    setReason("");
    setError(null);
  }

  function cancel() {
    reset();
    setEditing(false);
  }

  function save() {
    if (start === plannedStartHHMM && finish === plannedFinishHHMM) {
      setEditing(false);
      return;
    }
    if (needsReason && !reason.trim()) {
      setError("Reason required — change is over 15 min from standard");
      return;
    }
    startTransition(async () => {
      try {
        await updateRosterTimesAction(dailyRosterId, start, finish, reason.trim() || undefined);
        setError(null);
        setEditing(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    });
  }

  if (disabled) {
    return (
      <span className="font-mono text-xs">
        {plannedStartHHMM}–{plannedFinishHHMM}
      </span>
    );
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Click to change times"
        className="font-mono text-xs underline decoration-dotted decoration-zinc-400 hover:decoration-solid"
      >
        {plannedStartHHMM}–{plannedFinishHHMM}
      </button>
    );
  }

  return (
    <div
      className="flex flex-col gap-1"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) save();
      }}
    >
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
          className="w-[6.5rem] rounded border border-zinc-300 bg-white px-1 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-950"
        />
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
      {needsReason && (
        <input
          type="text"
          placeholder="Reason (required)"
          value={reason}
          disabled={isPending}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") cancel();
          }}
          className="w-48 rounded border border-zinc-300 bg-white px-1 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-950"
        />
      )}
      {error && <div className="w-48 text-[10px] text-red-600">{error}</div>}
    </div>
  );
}
