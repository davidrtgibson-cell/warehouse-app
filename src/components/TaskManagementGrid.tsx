"use client";

import { useState, useTransition } from "react";
import { createTaskAction, moveTaskAction, setTaskActiveAction, setTaskVisibleAction, updateTaskAction } from "@/lib/actions/tasks";
import type { DepartmentOption } from "@/components/EmployeeManagementGrid";

export type TaskRow = {
  id: string;
  name: string;
  category: "PRODUCTIVE" | "INDIRECT" | "LEAVE";
  isPaid: boolean;
  isActive: boolean;
  isVisible: boolean;
  sortOrder: number;
  departmentId: string | null;
  departmentName: string | null;
};

function fieldClass() {
  return "rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950";
}

function categoryLabel(category: TaskRow["category"]) {
  if (category === "PRODUCTIVE") return "Direct";
  if (category === "INDIRECT") return "Indirect";
  return "Leave";
}

function CategorySelect({
  value,
  disabled,
  onChange,
}: {
  value: TaskRow["category"];
  disabled: boolean;
  onChange: (v: TaskRow["category"]) => void;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as TaskRow["category"])}
      className={fieldClass()}
    >
      <option value="PRODUCTIVE">Direct</option>
      <option value="INDIRECT">Indirect</option>
      <option value="LEAVE">Leave</option>
    </select>
  );
}

function DepartmentSelect({
  value,
  departments,
  disabled,
  onChange,
}: {
  value: string;
  departments: DepartmentOption[];
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={fieldClass()}>
      <option value="">Choose a department…</option>
      {departments.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </select>
  );
}

function EditTaskForm({
  initial,
  departments,
  onSave,
  onCancel,
  disabled,
}: {
  initial: { name: string; category: TaskRow["category"]; isPaid: boolean; departmentId: string | null };
  departments: DepartmentOption[];
  onSave: (name: string, category: TaskRow["category"], isPaid: boolean, departmentId: string) => Promise<void>;
  onCancel: () => void;
  disabled: boolean;
}) {
  const [name, setName] = useState(initial.name);
  const [category, setCategory] = useState<TaskRow["category"]>(initial.category);
  const [isPaid, setIsPaid] = useState(initial.isPaid);
  const [departmentId, setDepartmentId] = useState(initial.departmentId ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    startTransition(async () => {
      try {
        await onSave(name, category, isPaid, departmentId);
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
        placeholder="Task name"
        value={name}
        disabled={disabled || isPending}
        onChange={(e) => setName(e.target.value)}
        className={`${fieldClass()} w-full`}
      />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <CategorySelect value={category} disabled={disabled || isPending} onChange={setCategory} />
        <DepartmentSelect
          value={departmentId}
          departments={departments}
          disabled={disabled || isPending}
          onChange={setDepartmentId}
        />
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={isPaid}
            disabled={disabled || isPending}
            onChange={(e) => setIsPaid(e.target.checked)}
          />
          <span className="text-zinc-500">
            Paid{category !== "LEAVE" && " (only meaningful for Leave tasks)"}
          </span>
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
        <button type="button" disabled={isPending} onClick={onCancel} className="text-xs text-zinc-500 hover:underline">
          Cancel
        </button>
      </div>
    </div>
  );
}

function TaskRowView({
  task,
  departments,
  disabled,
  isFirst,
  isLast,
}: {
  task: TaskRow;
  departments: DepartmentOption[];
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
        await setTaskActiveAction(task.id, !task.isActive);
        setMessage(null);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Failed to update");
      }
    });
  }

  function toggleVisible() {
    startTransition(async () => {
      try {
        await setTaskVisibleAction(task.id, !task.isVisible);
        setMessage(null);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Failed to update");
      }
    });
  }

  function move(direction: "up" | "down") {
    startTransition(async () => {
      try {
        await moveTaskAction(task.id, direction);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Failed to reorder");
      }
    });
  }

  if (editing) {
    return (
      <EditTaskForm
        initial={{ name: task.name, category: task.category, isPaid: task.isPaid, departmentId: task.departmentId }}
        departments={departments}
        disabled={disabled}
        onCancel={() => setEditing(false)}
        onSave={async (name, category, isPaid, departmentId) => {
          await updateTaskAction(task.id, name, category, isPaid, departmentId);
          setEditing(false);
        }}
      />
    );
  }

  return (
    <div className={`flex items-center justify-between gap-3 py-3 ${!task.isActive ? "opacity-50" : ""}`}>
      <div>
        <div className="text-sm font-medium">{task.name}</div>
        <div className="text-xs text-zinc-500">
          {task.departmentName ?? <span className="text-amber-600 dark:text-amber-400">No department</span>}
          {" · "}
          {categoryLabel(task.category)}
          {task.category === "LEAVE" && (task.isPaid ? " · paid" : " · unpaid")}
          {!task.isVisible && " · hidden from live board"}
          {!task.isActive && " · retired"}
        </div>
        {message && <div className="text-xs text-red-600">{message}</div>}
      </div>
      <div className="flex items-center gap-1 text-xs">
        {task.isActive && (
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
          onClick={toggleVisible}
          title={
            task.isVisible
              ? "Hide from the live board grid — still selectable as a move target"
              : "Show a card for this task on the live board"
          }
          className="rounded border border-zinc-300 px-2 py-0.5 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          {task.isVisible ? "Hide from board" : "Show on board"}
        </button>
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
          {task.isActive ? "Retire" : "Reactivate"}
        </button>
      </div>
    </div>
  );
}

function AddTaskForm({ departments, disabled }: { departments: DepartmentOption[]; disabled: boolean }) {
  const [open, setOpen] = useState(false);

  if (departments.length === 0) {
    return <p className="text-sm text-zinc-500">Add a department above before adding tasks.</p>;
  }

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        + Add task
      </button>
    );
  }
  return (
    <EditTaskForm
      initial={{ name: "", category: "PRODUCTIVE", isPaid: true, departmentId: null }}
      departments={departments}
      disabled={disabled}
      onCancel={() => setOpen(false)}
      onSave={async (name, category, isPaid, departmentId) => {
        await createTaskAction(name, category, isPaid, departmentId);
        setOpen(false);
      }}
    />
  );
}

export function TaskManagementGrid({
  tasks,
  departments,
  disabled,
}: {
  tasks: TaskRow[];
  departments: DepartmentOption[];
  disabled: boolean;
}) {
  const active = tasks.filter((t) => t.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  const retired = tasks.filter((t) => !t.isActive);

  return (
    <div className="space-y-4">
      <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {active.length === 0 ? (
          <p className="py-3 text-sm text-zinc-500">No active tasks.</p>
        ) : (
          active.map((task, i) => (
            <TaskRowView
              key={task.id}
              task={task}
              departments={departments}
              disabled={disabled}
              isFirst={i === 0}
              isLast={i === active.length - 1}
            />
          ))
        )}
      </div>
      <AddTaskForm departments={departments} disabled={disabled} />
      {retired.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-zinc-500 hover:underline">
            {retired.length} retired task{retired.length === 1 ? "" : "s"}
          </summary>
          <div className="mt-2 divide-y divide-zinc-200 dark:divide-zinc-800">
            {retired.map((task) => (
              <TaskRowView key={task.id} task={task} departments={departments} disabled={disabled} isFirst isLast />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
