"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { addDaysToDateString } from "@/lib/format";

// Local copy of schedule.ts's DATE_RE — can't import that module here, it
// pulls in the Prisma client (server-only) at module scope.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function DateNav({ basePath, dateStr }: { basePath: string; dateStr: string }) {
  const router = useRouter();
  const prevDate = addDaysToDateString(dateStr, -1);
  const nextDate = addDaysToDateString(dateStr, 1);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link
        href={`${basePath}?date=${prevDate}`}
        className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        ← Previous day
      </Link>
      <Link
        href={`${basePath}?date=${nextDate}`}
        className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        Next day →
      </Link>
      {/* key forces a remount when dateStr changes via Previous/Next day —
          otherwise this uncontrolled input's defaultValue only applies once
          and goes stale after those links navigate elsewhere. */}
      <input
        key={dateStr}
        type="date"
        defaultValue={dateStr}
        onChange={(e) => {
          if (DATE_RE.test(e.target.value)) router.push(`${basePath}?date=${e.target.value}`);
        }}
        className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
      />
    </div>
  );
}
