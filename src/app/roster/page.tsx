import Link from "next/link";
import { prisma } from "@/lib/db";
import { Shift, RosterStatus, RosterSource, type EmploymentType } from "@/generated/prisma/client";
import {
  addDaysToDateString,
  dateOnlyFromString,
  fmtTimeSydney,
  fmtWorkDate,
  toDateOnlyString,
} from "@/lib/format";

export const dynamic = "force-dynamic";

const SHIFT_ORDER: Shift[] = [Shift.AM, Shift.PM, Shift.NIGHT];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todaySydneyDateString() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
}

// Defaults to the most recent work date with a roster so the page never
// opens empty in a system where "today" hasn't been generated yet.
async function resolveDate(requested: string | undefined) {
  if (requested && DATE_RE.test(requested)) return requested;

  const latest = await prisma.dailyRoster.aggregate({ _max: { workDate: true } });
  if (latest._max.workDate) return toDateOnlyString(latest._max.workDate);

  return todaySydneyDateString();
}

function formatEmploymentType(type: EmploymentType, agencyName: string | null) {
  const label = type.replace("_", " ").toLowerCase();
  const capitalized = label.charAt(0).toUpperCase() + label.slice(1);
  return agencyName ? `${capitalized} — ${agencyName}` : capitalized;
}

const STATUS_STYLES: Record<RosterStatus, string> = {
  PLANNED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  ABSENT: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  CANCELLED: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

export default async function RosterPage(props: PageProps<"/roster">) {
  const sp = await props.searchParams;
  const requested = typeof sp.date === "string" ? sp.date : undefined;
  const dateStr = await resolveDate(requested);
  const workDate = dateOnlyFromString(dateStr);

  const rows = await prisma.dailyRoster.findMany({
    where: { workDate },
    include: { employee: { include: { department: true } }, defaultTask: true },
  });

  const byShift = new Map<Shift, typeof rows>();
  for (const shift of SHIFT_ORDER) byShift.set(shift, []);
  for (const row of rows) byShift.get(row.shift)?.push(row);
  for (const list of byShift.values()) {
    list.sort((a, b) =>
      `${a.employee.lastName} ${a.employee.firstName}`.localeCompare(
        `${b.employee.lastName} ${b.employee.firstName}`
      )
    );
  }

  const absentCount = rows.filter((r) => r.rosterStatus === RosterStatus.ABSENT).length;
  const manualCount = rows.filter((r) => r.rosterSource === RosterSource.MANUAL_CASUAL).length;

  const prevDate = addDaysToDateString(dateStr, -1);
  const nextDate = addDaysToDateString(dateStr, 1);

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans dark:bg-black dark:text-zinc-50">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="space-y-4">
          <div>
            <Link href="/" className="text-sm text-zinc-500 hover:underline">
              ← Home
            </Link>
            <h1 className="text-2xl font-semibold">Employee roster</h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{fmtWorkDate(workDate)}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/roster?date=${prevDate}`}
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              ← Previous day
            </Link>
            <Link
              href={`/roster?date=${nextDate}`}
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Next day →
            </Link>
            <form action="/roster" className="flex items-center gap-2">
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
        </header>

        <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Rostered" value={rows.length} />
          <Stat label="AM" value={byShift.get(Shift.AM)?.length ?? 0} />
          <Stat label="PM" value={byShift.get(Shift.PM)?.length ?? 0} />
          <Stat label="Night" value={byShift.get(Shift.NIGHT)?.length ?? 0} />
          <Stat label="Absent" value={absentCount} />
          <Stat label="Casual/manual add" value={manualCount} />
        </section>

        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
            No roster found for {dateStr}.
          </div>
        ) : (
          SHIFT_ORDER.map((shift) => {
            const list = byShift.get(shift) ?? [];
            if (list.length === 0) return null;
            return (
              <section key={shift}>
                <h2 className="mb-2 text-sm font-semibold text-zinc-500">
                  {shift} shift ({list.length})
                </h2>
                <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-100 text-xs uppercase text-zinc-500 dark:bg-zinc-900">
                      <tr>
                        <th className="px-3 py-2">Employee</th>
                        <th className="px-3 py-2">Department</th>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">Planned</th>
                        <th className="px-3 py-2">Task</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Source</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                      {list.map((row) => (
                        <tr key={row.id} className="bg-white dark:bg-zinc-950">
                          <td className="px-3 py-2">
                            <div className="font-medium">
                              {row.employee.firstName} {row.employee.lastName}
                            </div>
                            <div className="font-mono text-xs text-zinc-500">
                              {row.employee.employeeCode}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                            {row.employee.department?.name ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                            {formatEmploymentType(row.employee.employmentType, row.employee.agencyName)}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {fmtTimeSydney(row.plannedStart)}–{fmtTimeSydney(row.approvedFinish)}
                            {row.shiftExtended && (
                              <span
                                className="ml-1 rounded bg-amber-100 px-1 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                                title={row.extensionNote ?? "Shift extended"}
                              >
                                extended
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">{row.defaultTask.name}</td>
                          <td className="px-3 py-2">
                            <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[row.rosterStatus]}`}>
                              {row.rosterStatus}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-zinc-500">
                            {row.rosterSource === RosterSource.MANUAL_CASUAL ? "Casual/manual" : "Standard"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-zinc-500">{label}</div>
    </div>
  );
}
