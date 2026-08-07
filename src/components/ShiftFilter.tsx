import Link from "next/link";
import { Shift } from "@/generated/prisma/enums";
import type { ShiftFilter as ShiftFilterValue } from "@/lib/schedule";

const OPTIONS: { value: ShiftFilterValue; label: string }[] = [
  { value: "ALL", label: "All shifts" },
  { value: Shift.AM, label: "AM" },
  { value: Shift.PM, label: "PM" },
  { value: Shift.NIGHT, label: "Night" },
];

export function ShiftFilterNav({
  basePath,
  dateStr,
  value,
}: {
  basePath: string;
  dateStr: string;
  value: ShiftFilterValue;
}) {
  return (
    <div className="flex items-center gap-1 rounded border border-zinc-300 p-0.5 text-sm dark:border-zinc-700">
      {OPTIONS.map((opt) => {
        const active = opt.value === value;
        const href = opt.value === "ALL" ? `${basePath}?date=${dateStr}` : `${basePath}?date=${dateStr}&shift=${opt.value}`;
        return (
          <Link
            key={opt.value}
            href={href}
            className={`rounded px-2.5 py-1 ${
              active
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "hover:bg-zinc-100 dark:hover:bg-zinc-900"
            }`}
          >
            {opt.label}
          </Link>
        );
      })}
    </div>
  );
}
