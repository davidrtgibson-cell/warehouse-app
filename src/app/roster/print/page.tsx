import Link from "next/link";
import { prisma } from "@/lib/db";
import { RosterStatus, Shift } from "@/generated/prisma/enums";
import { dateOnlyFromString, fmtWorkDate } from "@/lib/format";
import { parseShiftFilter, resolveWorkDate } from "@/lib/schedule";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

const SHIFT_ORDER: Shift[] = [Shift.AM, Shift.PM, Shift.NIGHT];

export default async function RosterPrintPage(props: PageProps<"/roster/print">) {
  const sp = await props.searchParams;
  const requestedDate = typeof sp.date === "string" ? sp.date : undefined;
  const dateStr = await resolveWorkDate(requestedDate);
  const workDate = dateOnlyFromString(dateStr);
  const shiftFilter = parseShiftFilter(typeof sp.shift === "string" ? sp.shift : undefined);

  const rows = await prisma.dailyRoster.findMany({
    where: {
      workDate,
      rosterStatus: RosterStatus.PLANNED,
      ...(shiftFilter === "ALL" ? {} : { shift: shiftFilter }),
    },
    include: { employee: true, defaultTask: true },
  });

  const shifts = shiftFilter === "ALL" ? SHIFT_ORDER : [shiftFilter];

  type Row = (typeof rows)[number];
  const byShift = new Map<Shift, Row[]>();
  for (const shift of shifts) byShift.set(shift, []);
  for (const row of rows) byShift.get(row.shift)?.push(row);

  function groupByTask(list: Row[]) {
    const map = new Map<string, { taskName: string; sortOrder: number; rows: Row[] }>();
    for (const row of list) {
      const entry = map.get(row.defaultTaskId) ?? {
        taskName: row.defaultTask.name,
        sortOrder: row.defaultTask.sortOrder,
        rows: [],
      };
      entry.rows.push(row);
      map.set(row.defaultTaskId, entry);
    }
    return Array.from(map.values())
      .map((entry) => ({
        ...entry,
        rows: entry.rows.sort((a, b) =>
          `${a.employee.lastName} ${a.employee.firstName}`.localeCompare(
            `${b.employee.lastName} ${b.employee.firstName}`
          )
        ),
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans dark:bg-black dark:text-zinc-50">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="no-print flex items-center justify-between">
          <Link href={`/roster/build?date=${dateStr}`} className="text-sm text-zinc-500 hover:underline">
            ← Back to build roster
          </Link>
          <PrintButton />
        </div>

        <header>
          <h1 className="text-2xl font-semibold">Task assignment sheet</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {fmtWorkDate(workDate)} · {shiftFilter === "ALL" ? "All shifts" : `${shiftFilter} shift`}
          </p>
        </header>

        {rows.length === 0 ? (
          <p className="text-sm text-zinc-500">No planned employees for this date/shift.</p>
        ) : (
          shifts.map((shift) => {
            const list = byShift.get(shift) ?? [];
            if (list.length === 0) return null;
            const groups = groupByTask(list);
            return (
              <section key={shift} className="space-y-4 break-inside-avoid">
                {shiftFilter === "ALL" && (
                  <h2 className="border-b border-zinc-300 pb-1 text-lg font-semibold dark:border-zinc-700">
                    {shift} shift
                  </h2>
                )}
                {groups.map((group) => (
                  <div key={group.taskName} className="break-inside-avoid">
                    <h3 className="text-base font-semibold">
                      {group.taskName} <span className="font-normal text-zinc-500">({group.rows.length})</span>
                    </h3>
                    <ul className="mt-1 grid grid-cols-2 gap-x-6 gap-y-0.5 text-sm">
                      {group.rows.map((row) => (
                        <li key={row.id} className="flex justify-between border-b border-dotted border-zinc-300 py-0.5 dark:border-zinc-700">
                          <span>
                            {row.employee.firstName} {row.employee.lastName}
                          </span>
                          <span className="font-mono text-xs text-zinc-500">{row.employee.employeeCode}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
