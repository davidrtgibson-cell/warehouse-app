import Link from "next/link";
import { prisma } from "@/lib/db";
import { fmtTimeSydney } from "@/lib/format";

// Schema/seed verification page. Moved here from / once the live task
// board (the app's actual home page per the build order) landed there.
export const dynamic = "force-dynamic";

export default async function DebugPage() {
  const [
    employeeCount,
    employeesByType,
    employeesByShift,
    taskCount,
    tasks,
    departmentCount,
    standardRosterCount,
    dailyRosterCount,
    activeMovementCount,
    closedMovementCount,
    breakRules,
    sampleBoard,
  ] = await Promise.all([
    prisma.employee.count(),
    prisma.employee.groupBy({ by: ["employmentType"], _count: true }),
    prisma.employee.groupBy({ by: ["defaultShift"], _count: true }),
    prisma.task.count(),
    prisma.task.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.department.count(),
    prisma.standardRoster.count(),
    prisma.dailyRoster.count(),
    prisma.taskMovement.count({ where: { status: "ACTIVE" } }),
    prisma.taskMovement.count({ where: { status: "CLOSED" } }),
    prisma.breakRule.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.taskMovement.findMany({
      where: { status: "ACTIVE" },
      take: 20,
      orderBy: { startTime: "asc" },
      include: { employee: true, task: true, dailyRoster: true },
    }),
  ]);

  const boardByTask = new Map<string, typeof sampleBoard>();
  for (const m of sampleBoard) {
    const list = boardByTask.get(m.task.name) ?? [];
    list.push(m);
    boardByTask.set(m.task.name, list);
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans dark:bg-black dark:text-zinc-50">
      <div className="mx-auto max-w-5xl space-y-8">
        <header>
          <h1 className="text-2xl font-semibold">Warehouse App — schema &amp; seed check</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Data queried live from Postgres via Prisma. Diagnostic page, not part of normal use.
          </p>
          <Link
            href="/board"
            className="mt-3 inline-block rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            ← Live task board
          </Link>
        </header>

        <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Employees" value={employeeCount} />
          <Stat label="Departments" value={departmentCount} />
          <Stat label="Tasks" value={taskCount} />
          <Stat label="Standard roster rows" value={standardRosterCount} />
          <Stat label="Daily roster rows (today)" value={dailyRosterCount} />
          <Stat label="Active movements" value={activeMovementCount} />
          <Stat label="Closed movements" value={closedMovementCount} />
          <Stat label="Break rules" value={breakRules.length} />
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card title="Employees by type">
            <ul className="space-y-1 text-sm">
              {employeesByType.map((row) => (
                <li key={row.employmentType} className="flex justify-between">
                  <span>{row.employmentType}</span>
                  <span className="font-mono">{row._count}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Employees by default shift">
            <ul className="space-y-1 text-sm">
              {employeesByShift.map((row) => (
                <li key={row.defaultShift ?? "none"} className="flex justify-between">
                  <span>{row.defaultShift ?? "(none)"}</span>
                  <span className="font-mono">{row._count}</span>
                </li>
              ))}
            </ul>
          </Card>
        </section>

        <Card title="Tasks (admin-configurable)">
          <div className="flex flex-wrap gap-2">
            {tasks.map((t) => (
              <span
                key={t.id}
                className="rounded-full border border-zinc-300 px-3 py-1 text-xs dark:border-zinc-700"
              >
                {t.name} <span className="text-zinc-500">· {t.category}</span>
              </span>
            ))}
          </div>
        </Card>

        <Card title="Break rules">
          <ul className="space-y-1 text-sm">
            {breakRules.map((r) => (
              <li key={r.id}>
                {r.description} — <span className="font-mono">{r.unpaidMinutes} min</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title={`Sample of active movements (${sampleBoard.length} shown, grouped by task)`}>
          <div className="space-y-4">
            {Array.from(boardByTask.entries()).map(([taskName, movements]) => (
              <div key={taskName}>
                <h3 className="mb-1 text-sm font-semibold">{taskName}</h3>
                <ul className="space-y-0.5 text-sm text-zinc-700 dark:text-zinc-300">
                  {movements.map((m) => (
                    <li key={m.id} className="flex justify-between font-mono text-xs">
                      <span>
                        {m.employee.firstName} {m.employee.lastName} ({m.employee.employeeCode})
                      </span>
                      <span>started {fmtTimeSydney(m.startTime)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
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

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="mb-3 text-sm font-semibold text-zinc-500">{title}</h2>
      {children}
    </div>
  );
}
