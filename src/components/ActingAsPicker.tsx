"use client";

import { setActingUser } from "@/lib/actions/acting-user";

// Picker-only scaffolding — see the SWAP NOTE in src/lib/auth.ts. Delete
// this component outright (not adapt it) once real login lands.
export function ActingAsPicker({
  users,
  currentUserId,
}: {
  users: { id: string; name: string; role: string }[];
  currentUserId: string | null;
}) {
  return (
    <form action={setActingUser} className="flex items-center gap-2 text-xs">
      <label htmlFor="actingUserId" className="text-zinc-500">
        Acting as
      </label>
      <select
        id="actingUserId"
        name="userId"
        defaultValue={currentUserId ?? ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950"
      >
        <option value="" disabled>
          Select…
        </option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name} ({u.role === "ADMIN" ? "Admin" : "Leader"})
          </option>
        ))}
      </select>
    </form>
  );
}
