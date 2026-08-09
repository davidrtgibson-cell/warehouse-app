import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { UserManagementGrid, type UserRow } from "@/components/UserManagementGrid";

export const dynamic = "force-dynamic";

export default async function UsersSettingsPage() {
  // requireAdmin (not getCurrentUser) — this page also needs to know who
  // "you" are, to stop a self-deactivate in the UI (see isSelf in
  // UserManagementGrid). The settings layout already redirects non-admins
  // before this renders; requireAdmin here is the same defense-in-depth
  // belt-and-braces as every settings action.
  const currentUser = await requireAdmin();
  const users = await prisma.user.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }] });

  const rows: UserRow[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
  }));

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans dark:bg-black dark:text-zinc-50">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <Link href="/settings" className="text-sm text-zinc-500 hover:underline">
            ← Settings
          </Link>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Who can sign in, and at what level. Admins can reach every Settings screen (including this
            one); leaders get the live board, roster, and reports only. Deactivating someone signs them
            out everywhere immediately — there&apos;s no separate step for that.
          </p>
        </div>
        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <UserManagementGrid users={rows} currentUserId={currentUser.id} disabled={false} />
        </section>
      </div>
    </div>
  );
}
