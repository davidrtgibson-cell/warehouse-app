import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { MovementStatus, RosterStatus, Shift, TaskCategory } from "@/generated/prisma/client";
import { dateOnlyFromString, fmtTimeSydney, fmtWorkDate, toDateOnlyString } from "@/lib/format";
import { currentShiftAndDateFor, DATE_RE, getShiftWindows, sydneyNowMinutesOfDay, todaySydneyDateString } from "@/lib/schedule";
import { DateNav } from "@/components/DateNav";
import { ShiftFilterNav } from "@/components/ShiftFilter";
import { LiveBoardGrid, type BoardTaskGroup } from "@/components/LiveBoardGrid";
import { formatDuration, plannedMinutesOnTask } from "@/lib/board-time";

export const dynamic = "force-dynamic";

export default async function LiveBoardPage(props: PageProps<"/">) {
  const sp = await props.searchParams;

  // No explicit date/shift in the URL (e.g. clicking the "Live board" nav
  // link) defaults to whatever's genuinely live right now — today's date,
  // and the shift whose Settings-configured window contains the current
  // time — rather than "most recent date with a roster" + hardcoded AM,
  // which is what the other pages still use (fine there; this one is
  // specifically meant to reflect "right now").
  const shiftWindows = await getShiftWindows();
  const todayStr = todaySydneyDateString();
  const { shift: currentLiveShift, dateStr: currentLiveDateStr } = currentShiftAndDateFor(
    shiftWindows,
    todayStr,
    sydneyNowMinutesOfDay()
  );

  const requestedDate = typeof sp.date === "string" ? sp.date : undefined;
  const dateStr = requestedDate && DATE_RE.test(requestedDate) ? requestedDate : currentLiveDateStr;
  const workDate = dateOnlyFromString(dateStr);

  const requestedShift = typeof sp.shift === "string" ? sp.shift : undefined;
  const shift: Shift =
    requestedShift === Shift.AM || requestedShift === Shift.PM || requestedShift === Shift.NIGHT
      ? requestedShift
      : currentLiveShift;

  // Drag-and-drop is a "right now" gesture with no time picker of its own
  // (see LiveBoardGrid) — only makes sense when the shift being viewed is
  // the one actually live at this moment, not some other date/shift being
  // browsed for review or correction (those still use the checkbox+dropdown
  // Move/Extend flows, which do have explicit time controls).
  const isLiveShift = dateStr === currentLiveDateStr && shift === currentLiveShift;

  const currentUser = await getCurrentUser();

  const finalization = await prisma.rosterFinalization.findUnique({
    where: { workDate_shift: { workDate, shift } },
    include: { finalizedByUser: true },
  });

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans dark:bg-black dark:text-zinc-50">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="space-y-4">
          <div>
            <h1 className="text-2xl font-semibold">Live task board</h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{fmtWorkDate(workDate)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <DateNav basePath="/" dateStr={dateStr} />
            <ShiftFilterNav basePath="/" dateStr={dateStr} value={shift} includeAll={false} />
          </div>
        </header>

        {!finalization ? (
          <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Roster not yet finalised for this date/shift.
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              Finalise it from the Build Daily Roster screen to bring it live here.
            </p>
            <Link
              href={`/roster/build?date=${dateStr}&shift=${shift}`}
              className="mt-4 inline-block rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Go to Build Daily Roster →
            </Link>
          </div>
        ) : (
          <BoardContent
            workDate={workDate}
            shift={shift}
            currentUserId={currentUser?.id ?? null}
            finalizedAt={finalization.finalizedAt}
            finalizedByName={finalization.finalizedByUser.name}
            isLiveShift={isLiveShift}
          />
        )}
      </div>
    </div>
  );
}

async function BoardContent({
  workDate,
  shift,
  currentUserId,
  finalizedAt,
  finalizedByName,
  isLiveShift,
}: {
  workDate: Date;
  shift: Shift;
  currentUserId: string | null;
  finalizedAt: Date;
  finalizedByName: string;
  isLiveShift: boolean;
}) {
  const [rows, addableTasks] = await Promise.all([
    prisma.dailyRoster.findMany({
      where: { workDate, shift, rosterStatus: RosterStatus.PLANNED },
      include: { employee: { include: { department: true } } },
    }),
    prisma.task.findMany({
      where: { isActive: true, category: { not: TaskCategory.LEAVE } },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  const [activeMovements, closedMinutesByTask] = await Promise.all([
    prisma.taskMovement.findMany({
      where: { dailyRosterId: { in: rows.map((r) => r.id) }, status: MovementStatus.ACTIVE },
      include: { task: true },
    }),
    // Everyone who has already moved off a task today still counts toward its
    // labour-hours total, so this is scoped by workDate/shift via the roster
    // relation rather than the PLANNED-only `rows` set above (it should still
    // count someone's worked minutes even if they were later marked absent
    // or removed from the roster).
    prisma.taskMovement.groupBy({
      by: ["taskId"],
      where: { status: MovementStatus.CLOSED, dailyRoster: { workDate, shift } },
      _sum: { durationMinutes: true },
    }),
  ]);
  const movementByRosterId = new Map(activeMovements.map((m) => [m.dailyRosterId, m]));
  const closedMinutesMap = new Map(closedMinutesByTask.map((g) => [g.taskId, g._sum.durationMinutes ?? 0]));
  const closedMinutesShiftTotal = closedMinutesByTask.reduce((sum, g) => sum + (g._sum.durationMinutes ?? 0), 0);
  // Projected, not live-ticking — see plannedMinutesOnTask in board-time.ts.
  // Plain server-computed value now that it no longer needs a client-side
  // clock, so this stat doesn't need its own client component.
  const shiftTotalMinutes =
    closedMinutesShiftTotal +
    activeMovements.reduce((sum, m) => sum + plannedMinutesOnTask(m.startTime, m.scheduledFinish), 0);

  const byTask = new Map<string, { taskName: string; sortOrder: number; group: BoardTaskGroup }>();
  let notYetLive = 0;

  for (const row of rows) {
    const movement = movementByRosterId.get(row.id);
    if (!movement) {
      notYetLive++;
      continue;
    }
    const bucket = byTask.get(movement.taskId) ?? {
      taskName: movement.task.name,
      sortOrder: movement.task.sortOrder,
      group: {
        taskId: movement.taskId,
        taskName: movement.task.name,
        entries: [],
        closedMinutesThisShift: closedMinutesMap.get(movement.taskId) ?? 0,
      },
    };
    bucket.group.entries.push({
      dailyRosterId: row.id,
      firstName: row.employee.firstName,
      lastName: row.employee.lastName,
      employeeCode: row.employee.employeeCode,
      departmentName: row.employee.department?.name ?? null,
      startTime: movement.startTime,
      scheduledFinish: movement.scheduledFinish,
    });
    byTask.set(movement.taskId, bucket);
  }

  const taskGroups = Array.from(byTask.values())
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((b) => {
      b.group.entries.sort((a, c) => `${a.firstName} ${a.lastName}`.localeCompare(`${c.firstName} ${c.lastName}`));
      return b.group;
    });

  const workingCount = rows.length - notYetLive;

  return (
    <>
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-wrap gap-6 text-sm">
          <div>
            <span className="text-zinc-500">Live: </span>
            <span className="font-medium">{workingCount}</span>
          </div>
          <div>
            <span className="text-zinc-500">Tasks in use: </span>
            <span className="font-medium">{taskGroups.length}</span>
          </div>
          <div>
            <span className="text-zinc-500">Total shift hours: </span>
            <span className="font-medium">{formatDuration(shiftTotalMinutes)}</span>
          </div>
          {notYetLive > 0 && (
            <div>
              <span className="text-zinc-500">Not yet live: </span>
              <span className="font-medium text-amber-600 dark:text-amber-400">{notYetLive}</span>
            </div>
          )}
        </div>
        <p className="text-xs text-zinc-500">
          Finalised {fmtTimeSydney(finalizedAt)} by {finalizedByName}
        </p>
      </section>

      {notYetLive > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {notYetLive} planned employee{notYetLive === 1 ? "" : "s"} added since this was finalised —
          re-finalise on the Build Daily Roster screen to bring them live.
        </div>
      )}

      {!currentUserId && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Select an acting user from the &quot;Acting as&quot; picker above before moving anyone.
        </div>
      )}

      {taskGroups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No one currently active on this shift.
        </div>
      ) : (
        <LiveBoardGrid
          taskGroups={taskGroups}
          addableTasks={addableTasks.map((t) => ({ id: t.id, name: t.name }))}
          disabled={!currentUserId}
          workDateStr={toDateOnlyString(workDate)}
          shift={shift}
          isLiveShift={isLiveShift}
        />
      )}
    </>
  );
}
