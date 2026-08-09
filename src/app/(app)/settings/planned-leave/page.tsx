import Link from "next/link";
import { prisma } from "@/lib/db";
import { toDateOnlyString } from "@/lib/format";
import { todaySydneyDateString } from "@/lib/schedule";
import { TaskCategory } from "@/generated/prisma/client";
import { PlannedLeaveGrid, type PlannedLeaveEmployee, type LeaveTaskOption, type PlannedLeaveRow } from "@/components/PlannedLeaveGrid";

export const dynamic = "force-dynamic";

export default async function PlannedLeaveSettingsPage() {
  const todayStr = todaySydneyDateString();

  const [employeesRaw, leaveTasksRaw, leavesRaw] = await Promise.all([
    prisma.employee.findMany({
      where: { isActive: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.task.findMany({
      where: { isActive: true, category: TaskCategory.LEAVE },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.plannedLeave.findMany({
      include: { employee: true, task: true },
      orderBy: { dateFrom: "desc" },
    }),
  ]);

  const employees: PlannedLeaveEmployee[] = employeesRaw.map((e) => ({
    id: e.id,
    employeeCode: e.employeeCode,
    firstName: e.firstName,
    lastName: e.lastName,
  }));

  const taskOptions: LeaveTaskOption[] = leaveTasksRaw.map((t) => ({ id: t.id, name: t.name, isPaid: t.isPaid }));

  const rows: PlannedLeaveRow[] = leavesRaw.map((l) => ({
    id: l.id,
    employeeId: l.employeeId,
    employeeName: `${l.employee.firstName} ${l.employee.lastName}`,
    employeeCode: l.employee.employeeCode,
    taskId: l.taskId,
    taskName: l.task.name,
    dateFrom: toDateOnlyString(l.dateFrom),
    dateTo: toDateOnlyString(l.dateTo),
  }));

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans dark:bg-black dark:text-zinc-50">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <Link href="/settings" className="text-sm text-zinc-500 hover:underline">
            ← Settings
          </Link>
          <h1 className="text-2xl font-semibold">Planned leave</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Enter known future leave ahead of time — when the roster is generated for a covered date,
            that employee&apos;s row is pre-flagged onto the leave task instead of their usual Standard
            Roster task, no same-day &quot;mark absent&quot; needed. Doesn&apos;t touch roster rows already
            generated. Unplanned leave (sick, goes home mid-shift) doesn&apos;t need anything here — that&apos;s
            still just a live-board move to a leave task, or Mark Absent for the whole day.
          </p>
        </div>
        {taskOptions.length === 0 ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            No active Leave-category tasks exist yet — add one on the{" "}
            <Link href="/settings/tasks" className="underline">
              Tasks
            </Link>{" "}
            screen first.
          </div>
        ) : (
          <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <PlannedLeaveGrid rows={rows} employees={employees} taskOptions={taskOptions} todayStr={todayStr} />
          </section>
        )}
      </div>
    </div>
  );
}
