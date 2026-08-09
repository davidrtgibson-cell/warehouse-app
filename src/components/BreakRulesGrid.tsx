"use client";

import { useState, useTransition } from "react";
import {
  createBreakRuleAction,
  moveBreakRuleAction,
  setBreakRuleActiveAction,
  updateBreakRuleAction,
} from "@/lib/actions/break-rules";

export type BreakRuleRow = {
  id: string;
  description: string;
  minHoursWorked: string; // decimal serialized as string, e.g. "6.00"
  unpaidMinutes: number;
  isActive: boolean;
  sortOrder: number;
};

function fieldClass() {
  return "rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950";
}

// One rule's inline edit form — same click-to-edit shape used elsewhere
// (InlineTimesCell, ShiftHoursEditor), just with three fields instead of
// two times.
function EditRuleForm({
  initial,
  onSave,
  onCancel,
  disabled,
}: {
  initial: { description: string; minHoursWorked: string; unpaidMinutes: string };
  onSave: (description: string, minHoursWorked: string, unpaidMinutes: string) => Promise<void>;
  onCancel: () => void;
  disabled: boolean;
}) {
  const [description, setDescription] = useState(initial.description);
  const [minHoursWorked, setMinHoursWorked] = useState(initial.minHoursWorked);
  const [unpaidMinutes, setUnpaidMinutes] = useState(initial.unpaidMinutes);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    startTransition(async () => {
      try {
        await onSave(description, minHoursWorked, unpaidMinutes);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded border border-zinc-300 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900">
      <input
        type="text"
        placeholder="Description (e.g. the EA clause this comes from)"
        value={description}
        disabled={disabled || isPending}
        onChange={(e) => setDescription(e.target.value)}
        className={`${fieldClass()} w-full`}
      />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1">
          <span className="text-zinc-500">At least</span>
          <input
            type="number"
            step="0.25"
            min="0"
            value={minHoursWorked}
            disabled={disabled || isPending}
            onChange={(e) => setMinHoursWorked(e.target.value)}
            className={`${fieldClass()} w-20`}
          />
          <span className="text-zinc-500">hours worked</span>
        </label>
        <label className="flex items-center gap-1">
          <span className="text-zinc-500">→</span>
          <input
            type="number"
            step="1"
            min="0"
            value={unpaidMinutes}
            disabled={disabled || isPending}
            onChange={(e) => setUnpaidMinutes(e.target.value)}
            className={`${fieldClass()} w-20`}
          />
          <span className="text-zinc-500">unpaid minutes</span>
        </label>
      </div>
      {error && <div className="text-xs text-red-600">{error}</div>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={disabled || isPending}
          onClick={submit}
          className="rounded border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={onCancel}
          className="text-xs text-zinc-500 hover:underline"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function RuleRow({ rule, disabled, isFirst, isLast }: { rule: BreakRuleRow; disabled: boolean; isFirst: boolean; isLast: boolean }) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function toggleActive() {
    startTransition(async () => {
      try {
        await setBreakRuleActiveAction(rule.id, !rule.isActive);
        setMessage(null);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Failed to update");
      }
    });
  }

  function move(direction: "up" | "down") {
    startTransition(async () => {
      try {
        await moveBreakRuleAction(rule.id, direction);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Failed to reorder");
      }
    });
  }

  if (editing) {
    return (
      <EditRuleForm
        initial={{ description: rule.description, minHoursWorked: rule.minHoursWorked, unpaidMinutes: String(rule.unpaidMinutes) }}
        disabled={disabled}
        onCancel={() => setEditing(false)}
        onSave={async (description, minHoursWorked, unpaidMinutes) => {
          await updateBreakRuleAction(rule.id, description, minHoursWorked, unpaidMinutes);
          setEditing(false);
        }}
      />
    );
  }

  return (
    <div
      className={`flex items-center justify-between gap-3 py-3 ${!rule.isActive ? "opacity-50" : ""}`}
    >
      <div>
        <div className="text-sm font-medium">{rule.description}</div>
        <div className="text-xs text-zinc-500">
          ≥ {rule.minHoursWorked}h worked → {rule.unpaidMinutes} unpaid min
          {!rule.isActive && " · retired"}
        </div>
        {message && <div className="text-xs text-red-600">{message}</div>}
      </div>
      <div className="flex items-center gap-1 text-xs">
        {rule.isActive && (
          <>
            <button
              type="button"
              disabled={disabled || isPending || isFirst}
              onClick={() => move("up")}
              title="Move up"
              className="rounded border border-zinc-300 px-1.5 py-0.5 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              ↑
            </button>
            <button
              type="button"
              disabled={disabled || isPending || isLast}
              onClick={() => move("down")}
              title="Move down"
              className="rounded border border-zinc-300 px-1.5 py-0.5 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              ↓
            </button>
          </>
        )}
        <button
          type="button"
          disabled={disabled || isPending}
          onClick={() => setEditing(true)}
          className="rounded border border-zinc-300 px-2 py-0.5 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Edit
        </button>
        <button
          type="button"
          disabled={disabled || isPending}
          onClick={toggleActive}
          className="rounded border border-zinc-300 px-2 py-0.5 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          {rule.isActive ? "Retire" : "Reactivate"}
        </button>
      </div>
    </div>
  );
}

function AddRuleForm({ disabled }: { disabled: boolean }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        + Add rule
      </button>
    );
  }
  return (
    <EditRuleForm
      initial={{ description: "", minHoursWorked: "", unpaidMinutes: "" }}
      disabled={disabled}
      onCancel={() => setOpen(false)}
      onSave={async (description, minHoursWorked, unpaidMinutes) => {
        await createBreakRuleAction(description, minHoursWorked, unpaidMinutes);
        setOpen(false);
      }}
    />
  );
}

export function BreakRulesGrid({ rules, disabled }: { rules: BreakRuleRow[]; disabled: boolean }) {
  const active = rules.filter((r) => r.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  const retired = rules.filter((r) => !r.isActive);

  return (
    <div className="space-y-4">
      <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {active.length === 0 ? (
          <p className="py-3 text-sm text-zinc-500">No break rules yet — shifts get no unpaid deduction until one&apos;s added.</p>
        ) : (
          active.map((rule, i) => (
            <RuleRow key={rule.id} rule={rule} disabled={disabled} isFirst={i === 0} isLast={i === active.length - 1} />
          ))
        )}
      </div>
      <AddRuleForm disabled={disabled} />
      {retired.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-zinc-500 hover:underline">
            {retired.length} retired rule{retired.length === 1 ? "" : "s"}
          </summary>
          <div className="mt-2 divide-y divide-zinc-200 dark:divide-zinc-800">
            {retired.map((rule) => (
              <RuleRow key={rule.id} rule={rule} disabled={disabled} isFirst isLast />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
