import Link from "next/link";
import { addDaysToDateString } from "@/lib/format";

export function DateNav({ basePath, dateStr }: { basePath: string; dateStr: string }) {
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
      <form action={basePath} className="flex items-center gap-2">
        <input
          type="date"
          name="date"
          defaultValue={dateStr}
          className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <button
          type="submit"
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Go
        </button>
      </form>
    </div>
  );
}
