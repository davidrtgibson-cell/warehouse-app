import { requireCurrentUser } from "@/lib/auth";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";

export const dynamic = "force-dynamic";

// Deliberately outside /settings — that whole tree is ADMIN-only (see
// settings/layout.tsx), but any signed-in user needs to be able to change
// their own password, LEADER included.
export default async function AccountPage() {
  const user = await requireCurrentUser();

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans dark:bg-black dark:text-zinc-50">
      <div className="mx-auto max-w-md space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Account</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Signed in as {user.name} ({user.email}).
          </p>
        </div>
        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Change password</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Changing your password signs out any other device currently signed in as you.
          </p>
          <div className="mt-4">
            <ChangePasswordForm />
          </div>
        </section>
      </div>
    </div>
  );
}
