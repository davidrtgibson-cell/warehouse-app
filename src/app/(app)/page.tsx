import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Sits in front of the rest of the app (BACKLOG.md Tier 4 #9) — the live
// board keeps its own route (/board) and isn't replaced by this. Cards are
// filtered to what the signed-in user's role can actually reach, same
// ADMIN/LEADER split as the side nav (SideNav.tsx) and requireAdmin() (see
// src/lib/auth.ts) — this is deliberately just a visual front door onto
// existing routes, not a new authorization surface of its own.
const SECTIONS = [
  {
    href: "/board",
    label: "Live board",
    description: "Today's task movements, per shift — who's on what, right now.",
    adminOnly: false,
  },
  {
    href: "/roster",
    label: "Roster",
    description: "View the daily roster for any date.",
    adminOnly: false,
  },
  {
    href: "/roster/build",
    label: "Build roster",
    description: "Generate from Standard Roster, finalise, and adjust the daily roster.",
    adminOnly: false,
  },
  {
    href: "/reports",
    label: "Reports",
    description: "Labour hours by task and by team member, with CSV export.",
    adminOnly: false,
  },
  {
    href: "/settings",
    label: "Settings",
    description: "Users, tasks, team members, planned leave, shifts, break rules, and standard rosters.",
    adminOnly: true,
  },
];

export default async function HomePage() {
  const currentUser = await getCurrentUser();
  const isAdmin = currentUser?.role === "ADMIN";
  const sections = SECTIONS.filter((s) => !s.adminOnly || isAdmin);

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans dark:bg-black dark:text-zinc-50">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">
            {currentUser ? `Welcome, ${currentUser.name.split(" ")[0]}` : "Warehouse App"}
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Pick where you want to go.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {sections.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="rounded-lg border border-zinc-200 bg-white p-4 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
            >
              <div className="font-medium">{s.label}</div>
              <p className="mt-1 text-sm text-zinc-500">{s.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
