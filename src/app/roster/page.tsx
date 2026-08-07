import Link from "next/link";
import { prisma } from "@/lib/db";
import { Shift, RosterStatus, RosterSource } from "@/generated/prisma/client";
import { dateOnlyFromString, fmtTimeSydney, fmtWorkDate } from "@/lib/format";
import { resolveWorkDate } from "@/lib/schedule";
import { formatEmploymentType, ROSTER_STATUS_STYLES } from "@/lib/roster-display";
import { DateNav } from "@/components/DateNav";

export const dynamic = "force-dynamic";

const SHIFT_ORDER: Shift[] = [Shift.AM, Shift.PM, Shift.NIGHT];

export default async function RosterPage(props: PageProps<"/roster">) {
  const sp = await props.searchParams;
  const requested = typeof sp.date === "string" ? sp.date : undefined;
  const dateStr = await resolveWorkDate(requested);
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
            <DateNav basePath="/roster" dateStr={dateStr} />
            <Link
              href={`/roster/build?date=${dateStr}`}
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Build this roster →
            </Link>
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
                            <span className={`rounded px-2 py-0.5 text-xs font-medium ${ROSTER_STATUS_STYLES[row.rosterStatus]}`}>
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
