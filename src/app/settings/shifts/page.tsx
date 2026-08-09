import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hoursMinutesFromTimeValue } from "@/lib/schedule";
import { Shift } from "@/generated/prisma/client";
import { ShiftHoursEditor, type ShiftWindowRow } from "@/components/ShiftHoursEditor";

export const dynamic = "force-dynamic";

const SHIFT_ORDER: Shift[] = [Shift.AM, Shift.PM, Shift.NIGHT];

function hhmm(hours: number, minutes: number) {
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export default async function ShiftSettingsPage() {
  const [currentUser, rows] = await Promise.all([getCurrentUser(), prisma.shiftWindow.findMany()]);
  const byShift = new Map(rows.map((r) => [r.shift, r]));

  const windows: ShiftWindowRow[] = SHIFT_ORDER.map((shift) => {
    const row = byShift.get(shift);
    const start = row ? hoursMinutesFromTimeValue(row.startTime) : { hours: 0, minutes: 0 };
    const finish = row ? hoursMinutesFromTimeValue(row.finishTime) : { hours: 0, minutes: 0 };
    return { shift, startHHMM: hhmm(start.hours, start.minutes), finishHHMM: hhmm(finish.hours, finish.minutes) };
  });

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans dark:bg-black dark:text-zinc-50">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <Link href="/settings" className="text-sm text-zinc-500 hover:underline">
            ← Settings
          </Link>
          <h1 className="text-2xl font-semibold">Shift hours</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Canonical AM/PM/NIGHT start &amp; finish times, used to plan casual/agency additions to the roster
            and to interpret times entered on the live board. Editing here does not retroactively change
            already-planned roster rows.
          </p>
        </div>
        {!currentUser && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            Select an acting user from the &quot;Acting as&quot; picker above before editing.
          </div>
        )}
        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <ShiftHoursEditor windows={windows} disabled={!currentUser} />
        </section>
      </div>
    </div>
  );
}
