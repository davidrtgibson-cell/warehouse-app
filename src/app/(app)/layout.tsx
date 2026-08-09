import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { logoutAction } from "@/lib/actions/auth";
import { SideNav, type SideNavItem } from "@/components/SideNav";

// The actual "you must be signed in" gate for the whole app — every real
// page lives under this route group (a pure file-organization device;
// route groups don't appear in the URL, so /board stays /board, /roster
// stays /roster, etc.). /login sits outside this group specifically so it
// isn't wrapped by its own redirect.
//
// Side nav (BACKLOG.md Tier 4 #10) replaces the old top nav bar, done
// together with the home page (#9) since both are about overall app
// navigation/IA — the home page needed a nav item of its own ("Home",
// distinct from "Live board" now that the two are different routes/pages),
// which was the natural point to also switch the nav's shape.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const navItems: SideNavItem[] = [
    { href: "/", label: "Home" },
    { href: "/board", label: "Live board" },
    { href: "/roster", label: "Roster" },
    { href: "/roster/build", label: "Build roster" },
    { href: "/reports", label: "Reports" },
    ...(currentUser.role === "ADMIN" ? [{ href: "/settings", label: "Settings" }] : []),
  ];

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 flex-shrink-0 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="border-b border-zinc-200 px-4 py-4 dark:border-zinc-800">
          <Link href="/" className="text-sm font-semibold hover:underline">
            Warehouse App
          </Link>
        </div>
        <SideNav items={navItems} />
        <div className="border-t border-zinc-200 p-3 text-xs dark:border-zinc-800">
          <div className="text-zinc-500">
            {currentUser.name} <span className="text-zinc-400">({currentUser.role === "ADMIN" ? "Admin" : "Leader"})</span>
          </div>
          <form action={logoutAction} className="mt-1">
            <button type="submit" className="text-zinc-500 hover:underline">
              Log out
            </button>
          </form>
        </div>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
