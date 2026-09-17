"use client";

import { useState, useTransition } from "react";
import { changeOwnPasswordAction } from "@/lib/actions/account";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function submit() {
    setError(null);
    setSaved(false);

    if (newPassword !== confirmPassword) {
      setError("New passwords don't match");
      return;
    }

    startTransition(async () => {
      try {
        await changeOwnPasswordAction(currentPassword, newPassword);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setSaved(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to change password");
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-4"
    >
      <div>
        <label htmlFor="currentPassword" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Current password
        </label>
        <input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          disabled={isPending}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="mt-1 w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
      </div>
      <div>
        <label htmlFor="newPassword" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          New password
        </label>
        <input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={newPassword}
          disabled={isPending}
          onChange={(e) => setNewPassword(e.target.value)}
          className="mt-1 w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <p className="mt-1 text-xs text-zinc-500">At least 8 characters.</p>
      </div>
      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Confirm new password
        </label>
        <input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          disabled={isPending}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="mt-1 w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-green-600">Password changed.</p>}
      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {isPending ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
