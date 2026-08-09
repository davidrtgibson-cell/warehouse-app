import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { logoutAction } from "@/lib/actions/auth";

// The actual "you must be signed in" gate for the whole app — every real
// page lives under this route group (a pure file-organization device;
// route groups don't appear in the URL, so / stays /, /roster stays
// /roster, etc.). /login sits outside this group specifically so it isn't
// wrapped by its own redirect.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  return (
    <>
      <header className="border-b border-zinc-200 bg-white px-6 py-3 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <nav className="flex gap-4 text-sm">
            <Link href="/" className="hover:underline">
              Live board
            </Link>
            <Link href="/roster" className="hover:underline">
              Roster
            </Link>
            <Link href="/roster/build" className="hover:underline">
              Build roster
            </Link>
            <Link href="/reports" className="hover:underline">
              Reports
            </Link>
            <Link href="/settings" className="hover:underline">
              Settings
            </Link>
          </nav>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-zinc-500">
              {currentUser.name} <span className="text-zinc-400">({currentUser.role === "ADMIN" ? "Admin" : "Leader"})</span>
            </span>
            <form action={logoutAction}>
              <button type="submit" className="text-zinc-500 hover:underline">
                Log out
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </>
  );
}
