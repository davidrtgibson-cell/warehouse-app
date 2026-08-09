import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Already signed in (e.g. followed an old bookmark to /login) — no point
  // showing the form again.
  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-8 font-sans dark:bg-black dark:text-zinc-50">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <div>
          <h1 className="text-xl font-semibold">Warehouse App</h1>
          <p className="mt-1 text-sm text-zinc-500">Sign in to continue.</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
