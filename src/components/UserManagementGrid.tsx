"use client";

import { useState, useTransition } from "react";
import {
  createUserAction,
  resetUserPasswordAction,
  setUserActiveAction,
  updateUserRoleAction,
} from "@/lib/actions/users";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: "LEADER" | "ADMIN";
  isActive: boolean;
};

function fieldClass() {
  return "rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950";
}

function RoleSelect({
  value,
  disabled,
  onChange,
}: {
  value: "LEADER" | "ADMIN";
  disabled: boolean;
  onChange: (v: "LEADER" | "ADMIN") => void;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as "LEADER" | "ADMIN")}
      className={fieldClass()}
    >
      <option value="LEADER">Leader</option>
      <option value="ADMIN">Admin</option>
    </select>
  );
}

function ResetPasswordForm({
  disabled,
  onSave,
  onCancel,
}: {
  disabled: boolean;
  onSave: (newPassword: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    startTransition(async () => {
      try {
        await onSave(password);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to reset password");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded border border-zinc-300 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900">
      <label className="text-xs text-zinc-500">
        New password (min. 8 characters) — tell the user directly, there&apos;s no email reset flow yet.
      </label>
      <input
        type="text"
        placeholder="New password"
        value={password}
        disabled={disabled || isPending}
        onChange={(e) => setPassword(e.target.value)}
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
          {isPending ? "Saving…" : "Set password"}
        </button>
        <button type="button" disabled={isPending} onClick={onCancel} className="text-xs text-zinc-500 hover:underline">
          Cancel
        </button>
      </div>
    </div>
  );
}

function UserRowView({ user, disabled, isSelf }: { user: UserRow; disabled: boolean; isSelf: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function changeRole(role: "LEADER" | "ADMIN") {
    startTransition(async () => {
      try {
        await updateUserRoleAction(user.id, role);
        setMessage(null);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Failed to update role");
      }
    });
  }

  function toggleActive() {
    startTransition(async () => {
      try {
        await setUserActiveAction(user.id, !user.isActive);
        setMessage(null);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Failed to update");
      }
    });
  }

  if (resetting) {
    return (
      <ResetPasswordForm
        disabled={disabled}
        onCancel={() => setResetting(false)}
        onSave={async (newPassword) => {
          await resetUserPasswordAction(user.id, newPassword);
          setResetting(false);
        }}
      />
    );
  }

  return (
    <div className={`flex items-center justify-between gap-3 py-3 ${!user.isActive ? "opacity-50" : ""}`}>
      <div>
        <div className="text-sm font-medium">
          {user.name} {isSelf && <span className="text-xs text-zinc-400">(you)</span>}
        </div>
        <div className="text-xs text-zinc-500">
          {user.email}
          {!user.isActive && " · deactivated"}
        </div>
        {message && <div className="text-xs text-red-600">{message}</div>}
      </div>
      <div className="flex items-center gap-1 text-xs">
        <RoleSelect value={user.role} disabled={disabled || isPending || !user.isActive} onChange={changeRole} />
        <button
          type="button"
          disabled={disabled || isPending || !user.isActive}
          onClick={() => setResetting(true)}
          className="rounded border border-zinc-300 px-2 py-0.5 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Reset password
        </button>
        <button
          type="button"
          disabled={disabled || isPending || (isSelf && user.isActive)}
          title={isSelf && user.isActive ? "You can't deactivate your own account" : undefined}
          onClick={toggleActive}
          className="rounded border border-zinc-300 px-2 py-0.5 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          {user.isActive ? "Deactivate" : "Reactivate"}
        </button>
      </div>
    </div>
  );
}

function AddUserForm({ disabled }: { disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"LEADER" | "ADMIN">("LEADER");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        + Add user
      </button>
    );
  }

  function submit() {
    startTransition(async () => {
      try {
        await createUserAction(name, email, password, role);
        setName("");
        setEmail("");
        setPassword("");
        setRole("LEADER");
        setOpen(false);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create user");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded border border-zinc-300 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900">
      <input
        type="text"
        placeholder="Name"
        value={name}
        disabled={disabled || isPending}
        onChange={(e) => setName(e.target.value)}
        className={`${fieldClass()} w-full`}
      />
      <input
        type="email"
        placeholder="Email"
        value={email}
        disabled={disabled || isPending}
        onChange={(e) => setEmail(e.target.value)}
        className={`${fieldClass()} w-full`}
      />
      <input
        type="text"
        placeholder="Initial password (min. 8 characters)"
        value={password}
        disabled={disabled || isPending}
        onChange={(e) => setPassword(e.target.value)}
        className={`${fieldClass()} w-full`}
      />
      <div className="flex items-center gap-2 text-sm">
        <span className="text-zinc-500">Role</span>
        <RoleSelect value={role} disabled={disabled || isPending} onChange={setRole} />
      </div>
      {error && <div className="text-xs text-red-600">{error}</div>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={disabled || isPending}
          onClick={submit}
          className="rounded border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {isPending ? "Creating…" : "Create user"}
        </button>
        <button type="button" disabled={isPending} onClick={() => setOpen(false)} className="text-xs text-zinc-500 hover:underline">
          Cancel
        </button>
      </div>
    </div>
  );
}

export function UserManagementGrid({ users, currentUserId, disabled }: { users: UserRow[]; currentUserId: string; disabled: boolean }) {
  const active = users.filter((u) => u.isActive).sort((a, b) => a.name.localeCompare(b.name));
  const inactive = users.filter((u) => !u.isActive).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {active.length === 0 ? (
          <p className="py-3 text-sm text-zinc-500">No active users.</p>
        ) : (
          active.map((u) => <UserRowView key={u.id} user={u} disabled={disabled} isSelf={u.id === currentUserId} />)
        )}
      </div>
      <AddUserForm disabled={disabled} />
      {inactive.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-zinc-500 hover:underline">
            {inactive.length} deactivated user{inactive.length === 1 ? "" : "s"}
          </summary>
          <div className="mt-2 divide-y divide-zinc-200 dark:divide-zinc-800">
            {inactive.map((u) => (
              <UserRowView key={u.id} user={u} disabled={disabled} isSelf={u.id === currentUserId} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
