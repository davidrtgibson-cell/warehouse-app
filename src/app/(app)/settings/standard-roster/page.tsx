import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { standardRosterCurrentWhere } from "@/lib/roster-queries";
import { dateOnlyFromString, toDateOnlyString } from "@/lib/format";
import { hoursMinutesFromTimeValue, todaySydneyDateString } from "@/lib/schedule";
import { DayOfWeek, TaskCategory } from "@/generated/prisma/client";
import { StandardRosterGrid, type StandardRosterEmployee, type StandardRosterPattern } from "@/components/StandardRosterGrid";

export const dynamic = "force-dynamic";

const DAY_ORDER: DayOfWeek[] = [
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
  DayOfWeek.SATURDAY,
  DayOfWeek.SUNDAY,
];

export default async function StandardRosterSettingsPage() {
  const todayStr = todaySydneyDateString();
  const today = dateOnlyFromString(todayStr);

  const [currentUser, employeesRaw, activeRows, tasks] = await Promise.all([
    getCurrentUser(),
    prisma.employee.findMany({
      where: { isActive: true },
      include: { department: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.standardRoster.findMany({
      where: standardRosterCurrentWhere(today),
      include: { defaultTask: true },
    }),
    prisma.task.findMany({
      where: { isActive: true, category: { not: TaskCategory.LEAVE } },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  const employees: StandardRosterEmployee[] = employeesRaw.map((e) => ({
    id: e.id,
    employeeCode: e.employeeCode,
    firstName: e.firstName,
    lastName: e.lastName,
    employmentType: e.employmentType,
    agencyName: e.agencyName,
    departmentName: e.department?.name ?? null,
  }));

  const patterns: StandardRosterPattern[] = activeRows.map((r) => {
    const start = hoursMinutesFromTimeValue(r.startTime);
    const finish = hoursMinutesFromTimeValue(r.finishTime);
    return {
      id: r.id,
      employeeId: r.employeeId,
      dayOfWeek: r.dayOfWeek,
      shift: r.shift,
      startHHMM: `${String(start.hours).padStart(2, "0")}:${String(start.minutes).padStart(2, "0")}`,
      finishHHMM: `${String(finish.hours).padStart(2, "0")}:${String(finish.minutes).padStart(2, "0")}`,
      paidHours: Number(r.paidHours),
      taskId: r.defaultTaskId,
      taskName: r.defaultTask.name,
      effectiveFrom: toDateOnlyString(r.effectiveFrom),
    };
  });

  const taskOptions = tasks.map((t) => ({ id: t.id, name: t.name }));

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans dark:bg-black dark:text-zinc-50">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <Link href="/settings" className="text-sm text-zinc-500 hover:underline">
            ← Settings
          </Link>
          <h1 className="text-2xl font-semibold">Standard roster</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            The recurring weekly work pattern each employee is rostered against — what &quot;Generate from
            Standard Roster&quot; on the Build Roster screen reads from. Shown as of {todayStr}. Editing never
            overwrites history: changing or ending a pattern closes the old row out from a chosen date and
            (for edits) opens a new one, rather than mutating it in place.
          </p>
        </div>

        {!currentUser && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            Select an acting user from the &quot;Acting as&quot; picker above before editing.
          </div>
        )}

        <StandardRosterGrid
          employees={employees}
          patterns={patterns}
          dayOrder={DAY_ORDER}
          taskOptions={taskOptions}
          todayStr={todayStr}
          disabled={!currentUser}
        />
      </div>
    </div>
  );
}
