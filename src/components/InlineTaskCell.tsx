"use client";

import { useState, useTransition } from "react";
import { updateRosterTaskAction } from "@/lib/actions/roster";

export function InlineTaskCell({
  dailyRosterId,
  taskId,
  taskName,
  options,
  disabled,
}: {
  dailyRosterId: string;
  taskId: string;
  taskName: string;
  options: { id: string; name: string }[];
  disabled: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save(newTaskId: string) {
    if (newTaskId === taskId) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      try {
        await updateRosterTaskAction(dailyRosterId, newTaskId);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      }
      setEditing(false);
    });
  }

  if (disabled) return <span>{taskName}</span>;

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Click to change task"
        className="text-left underline decoration-dotted decoration-zinc-400 hover:decoration-solid"
      >
        {taskName}
      </button>
    );
  }

  return (
    <div>
      <select
        autoFocus
        defaultValue={taskId}
        disabled={isPending}
        onChange={(e) => save(e.currentTarget.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setEditing(false);
        }}
        className="rounded border border-zinc-300 bg-white px-1 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-950"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      {error && <div className="text-[10px] text-red-600">{error}</div>}
    </div>
  );
}
