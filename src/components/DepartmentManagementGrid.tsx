"use client";

import { useState, useTransition } from "react";
import {
  createDepartmentAction,
  moveDepartmentAction,
  setDepartmentActiveAction,
  updateDepartmentAction,
} from "@/lib/actions/departments";

export type DepartmentRow = {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
};

function fieldClass() {
  return "rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950";
}

function EditDepartmentForm({
  initial,
  onSave,
  onCancel,
  disabled,
}: {
  initial: { name: string };
  onSave: (name: string) => Promise<void>;
  onCancel: () => void;
  disabled: boolean;
}) {
  const [name, setName] = useState(initial.name);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    startTransition(async () => {
      try {
        await onSave(name);
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
        placeholder="Department name"
        value={name}
        disabled={disabled || isPending}
        onChange={(e) => setName(e.target.value)}
        className={`${fieldClass()} w-full`}
      />
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
        <button type="button" disabled={isPending} onClick={onCancel} className="text-xs text-zinc-500 hover:underline">
          Cancel
        </button>
      </div>
    </div>
  );
}

function DepartmentRowView({
  department,
  disabled,
  isFirst,
  isLast,
}: {
  department: DepartmentRow;
  disabled: boolean;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function toggleActive() {
    startTransition(async () => {
      try {
        await setDepartmentActiveAction(department.id, !department.isActive);
        setMessage(null);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Failed to update");
      }
    });
  }

  function move(direction: "up" | "down") {
    startTransition(async () => {
      try {
        await moveDepartmentAction(department.id, direction);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Failed to reorder");
      }
    });
  }

  if (editing) {
    return (
      <EditDepartmentForm
        initial={{ name: department.name }}
        disabled={disabled}
        onCancel={() => setEditing(false)}
        onSave={async (name) => {
          await updateDepartmentAction(department.id, name);
          setEditing(false);
        }}
      />
    );
  }

  return (
    <div className={`flex items-center justify-between gap-3 py-3 ${!department.isActive ? "opacity-50" : ""}`}>
      <div>
        <div className="text-sm font-medium">{department.name}</div>
        {!department.isActive && <div className="text-xs text-zinc-500">retired</div>}
        {message && <div className="text-xs text-red-600">{message}</div>}
      </div>
      <div className="flex items-center gap-1 text-xs">
        {department.isActive && (
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
          {department.isActive ? "Retire" : "Reactivate"}
        </button>
      </div>
    </div>
  );
}

function AddDepartmentForm({ disabled }: { disabled: boolean }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        + Add department
      </button>
    );
  }
  return (
    <EditDepartmentForm
      initial={{ name: "" }}
      disabled={disabled}
      onCancel={() => setOpen(false)}
      onSave={async (name) => {
        await createDepartmentAction(name);
        setOpen(false);
      }}
    />
  );
}

export function DepartmentManagementGrid({ departments, disabled }: { departments: DepartmentRow[]; disabled: boolean }) {
  const active = departments.filter((d) => d.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  const retired = departments.filter((d) => !d.isActive);

  return (
    <div className="space-y-4">
      <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {active.length === 0 ? (
          <p className="py-3 text-sm text-zinc-500">No active departments.</p>
        ) : (
          active.map((department, i) => (
            <DepartmentRowView
              key={department.id}
              department={department}
              disabled={disabled}
              isFirst={i === 0}
              isLast={i === active.length - 1}
            />
          ))
        )}
      </div>
      <AddDepartmentForm disabled={disabled} />
      {retired.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-zinc-500 hover:underline">
            {retired.length} retired department{retired.length === 1 ? "" : "s"}
          </summary>
          <div className="mt-2 divide-y divide-zinc-200 dark:divide-zinc-800">
            {retired.map((department) => (
              <DepartmentRowView key={department.id} department={department} disabled={disabled} isFirst isLast />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
