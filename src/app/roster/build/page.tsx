import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Shift, RosterStatus, RosterSource, TaskCategory } from "@/generated/prisma/client";
import { dateOnlyFromString, fmtTimeSydney, fmtWorkDate } from "@/lib/format";
import { dayOfWeekForDateString, resolveWorkDate } from "@/lib/schedule";
import { standardRosterEligibilityWhere } from "@/lib/roster-queries";
import { formatEmploymentType, ROSTER_STATUS_STYLES } from "@/lib/roster-display";
import { DateNav } from "@/components/DateNav";
import { CasualPoolPanel } from "@/components/CasualPoolPanel";
import { generateDailyRosterFromStandard, markAbsentAction, undoAbsentAction } from "@/lib/actions/roster";

export const dynamic = "force-dynamic";

const SHIFT_ORDER: Shift[] = [Shift.AM, Shift.PM, Shift.NIGHT];

export default async function BuildRosterPage(props: PageProps<"/roster/build">) {
  const sp = await props.searchParams;
  const requested = typeof sp.date === "string" ? sp.date : undefined;
  const dateStr = await resolveWorkDate(requested);
  const workDate = dateOnlyFromString(dateStr);
  const dayOfWeek = dayOfWeekForDateString(dateStr);

  const currentUser = await getCurrentUser();

  const rows = await prisma.dailyRoster.findMany({
    where: { workDate },
    include: { employee: { include: { department: true } }, defaultTask: true },
  });

  const rosteredEmployeeIds = rows.map((r) => r.employeeId);

  const [eligibleStandardRosterCount, leaveTasks, addableTasks, poolEmployeesRaw] = await Promise.all([
    prisma.standardRoster.count({ where: standardRosterEligibilityWhere(dayOfWeek, workDate) }),
    prisma.task.findMany({
      where: { isActive: true, category: TaskCategory.LEAVE },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.task.findMany({
      where: { isActive: true, category: { not: TaskCategory.LEAVE } },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.employee.findMany({
      where: {
        isActive: true,
        id: { notIn: rosteredEmployeeIds.length ? rosteredEmployeeIds : undefined },
        standardRosters: {
          none: {
            dayOfWeek,
            isActive: true,
            effectiveFrom: { lte: workDate },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: workDate } }],
          },
        },
      },
      include: { department: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ]);

  const generatedFromStandardCount = rows.filter((r) => r.rosterSource === RosterSource.STANDARD_ROSTER).length;
  const pendingGenerateCount = Math.max(0, eligibleStandardRosterCount - generatedFromStandardCount);

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

  const poolEmployees = poolEmployeesRaw.map((e) => ({
    id: e.id,
    employeeCode: e.employeeCode,
    firstName: e.firstName,
    lastName: e.lastName,
    employmentType: e.employmentType,
    agencyName: e.agencyName,
    defaultShift: e.defaultShift,
    departmentName: e.department?.name ?? null,
  }));

  const addableTaskOptions = addableTasks.map((t) => ({ id: t.id, name: t.name, category: t.category }));

  async function generateAction() {
    "use server";
    await generateDailyRosterFromStandard(dateStr);
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans dark:bg-black dark:text-zinc-50">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="space-y-4">
          <div>
            <Link href="/roster" className="text-sm text-zinc-500 hover:underline">
              ← View roster
            </Link>
            <h1 className="text-2xl font-semibold">Build daily roster</h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{fmtWorkDate(workDate)}</p>
          </div>
          <DateNav basePath="/roster/build" dateStr={dateStr} />
        </header>

        {!currentUser && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            Select an acting user from the "Acting as" picker above before generating, marking absences,
            or adding to the roster.
          </div>
        )}

        <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Rostered" value={rows.length} />
          <Stat label="AM" value={byShift.get(Shift.AM)?.length ?? 0} />
          <Stat label="PM" value={byShift.get(Shift.PM)?.length ?? 0} />
          <Stat label="Night" value={byShift.get(Shift.NIGHT)?.length ?? 0} />
          <Stat label="Absent" value={absentCount} />
          <Stat label="Casual/manual add" value={manualCount} />
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Generate from Standard Roster</h2>
              <p className="mt-1 text-xs text-zinc-500">
                {eligibleStandardRosterCount} standard-roster entries match this date
                {generatedFromStandardCount > 0 && `, ${generatedFromStandardCount} already generated`}.
                Already-generated rows are skipped — safe to run again.
              </p>
            </div>
            <form action={generateAction}>
              <button
                type="submit"
                disabled={!currentUser || pendingGenerateCount === 0}
                className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                {pendingGenerateCount > 0 ? `Generate (${pendingGenerateCount} new)` : "Up to date"}
              </button>
            </form>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-zinc-500">Casual / agency pool</h2>
          <CasualPoolPanel
            dateStr={dateStr}
            employees={poolEmployees}
            tasks={addableTaskOptions}
            disabled={!currentUser}
          />
        </section>

        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
            No roster rows for {dateStr} yet. Generate from Standard Roster or add from the casual pool
            above.
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
                        <th className="px-3 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                      {list.map((row) => (
                        <tr key={row.id} className="bg-white align-top dark:bg-zinc-950">
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
                          </td>
                          <td className="px-3 py-2">{row.defaultTask.name}</td>
                          <td className="px-3 py-2">
                            <span
                              className={`rounded px-2 py-0.5 text-xs font-medium ${ROSTER_STATUS_STYLES[row.rosterStatus]}`}
                            >
                              {row.rosterStatus}
                            </span>
                            {row.overrideReason && (
                              <div className="mt-0.5 text-[11px] text-zinc-500">{row.overrideReason}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-zinc-500">
                            {row.rosterSource === RosterSource.MANUAL_CASUAL ? "Casual/manual" : "Standard"}
                          </td>
                          <td className="px-3 py-2">
                            {row.rosterStatus === RosterStatus.PLANNED && (
                              <details>
                                <summary className="cursor-pointer text-xs text-red-600 hover:underline dark:text-red-400">
                                  Mark absent
                                </summary>
                                <form
                                  action={markAbsentAction}
                                  className="mt-1 flex items-center gap-1"
                                >
                                  <input type="hidden" name="dailyRosterId" value={row.id} />
                                  <select
                                    name="leaveTaskId"
                                    required
                                    disabled={!currentUser}
                                    defaultValue=""
                                    className="rounded border border-zinc-300 bg-white px-1 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-950"
                                  >
                                    <option value="" disabled>
                                      Leave type…
                                    </option>
                                    {leaveTasks.map((t) => (
                                      <option key={t.id} value={t.id}>
                                        {t.name}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    type="submit"
                                    disabled={!currentUser}
                                    className="rounded border border-zinc-300 px-2 py-0.5 text-xs hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                                  >
                                    Confirm
                                  </button>
                                </form>
                              </details>
                            )}
                            {row.rosterStatus === RosterStatus.ABSENT && (
                              <form action={undoAbsentAction}>
                                <input type="hidden" name="dailyRosterId" value={row.id} />
                                <button
                                  type="submit"
                                  disabled={!currentUser}
                                  className="text-xs text-blue-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50 dark:text-blue-400"
                                >
                                  Undo
                                </button>
                              </form>
                            )}
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
