"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type SideNavItem = { href: string; label: string };

// Highlights whichever item is the most specific (longest href) match for
// the current path, so e.g. "/roster/build" lights up "Build roster" and
// not also "Roster" — a plain startsWith per item would double-match since
// "/roster/build" also starts with "/roster".
function activeHref(pathname: string, items: SideNavItem[]): string | null {
  const matches = items.filter((i) => (i.href === "/" ? pathname === "/" : pathname === i.href || pathname.startsWith(`${i.href}/`)));
  if (matches.length === 0) return null;
  return matches.reduce((best, i) => (i.href.length > best.href.length ? i : best)).href;
}

export function SideNav({ items }: { items: SideNavItem[] }) {
  const pathname = usePathname();
  const active = activeHref(pathname, items);

  return (
    <nav className="flex flex-1 flex-col gap-0.5 p-3 text-sm">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={
            item.href === active
              ? "rounded px-3 py-2 font-medium bg-zinc-100 dark:bg-zinc-900"
              : "rounded px-3 py-2 text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
          }
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
