import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { MovementStatus, RosterStatus, Shift, TaskCategory } from "@/generated/prisma/client";
import { dateOnlyFromString, fmtTimeSydney, fmtWorkDate, toDateOnlyString } from "@/lib/format";
import {
  currentShiftAndDateFor,
  DATE_RE,
  getShiftWindows,
  nextShiftAndDate,
  plannedWindow,
  previousShiftAndDate,
  sydneyInstant,
  sydneyNowMinutesOfDay,
  todaySydneyDateString,
  type ShiftWindowMap,
} from "@/lib/schedule";
import { DateNav } from "@/components/DateNav";
import { ShiftFilterNav } from "@/components/ShiftFilter";
import { LiveBoardGrid, type BoardTaskGroup } from "@/components/LiveBoardGrid";
import { clampToWindow, elapsedMinutes, formatDuration } from "@/lib/board-time";
import { computeEmployeeBreakAllocation, sumDeductionsByTask, type MovementForBreakAllocation } from "@/lib/break-rules";

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
            dateStr={dateStr}
            shift={shift}
            shiftWindows={shiftWindows}
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
  dateStr,
  shift,
  shiftWindows,
  currentUserId,
  finalizedAt,
  finalizedByName,
  isLiveShift,
}: {
  workDate: Date;
  dateStr: string;
  shift: Shift;
  shiftWindows: ShiftWindowMap;
  currentUserId: string | null;
  finalizedAt: Date;
  finalizedByName: string;
  isLiveShift: boolean;
}) {
  const thisWindow = plannedWindow(dateStr, shiftWindows[shift].start, shiftWindows[shift].finish);
  const { shift: prevShift, dateStr: prevDateStr } = previousShiftAndDate(dateStr, shift);
  const prevWorkDate = dateOnlyFromString(prevDateStr);
  const prevWindow = plannedWindow(prevDateStr, shiftWindows[prevShift].start, shiftWindows[prevShift].finish);
  const { shift: nextShift, dateStr: nextDateStr } = nextShiftAndDate(dateStr, shift);
  const nextWorkDate = dateOnlyFromString(nextDateStr);
  const nextWindow = plannedWindow(nextDateStr, shiftWindows[nextShift].start, shiftWindows[nextShift].finish);
  // Break deduction is computed per shift, using only this shift's own
  // native rows — a person's OT spilling into the next shift's board is
  // that next shift's own break concern, same as everywhere else this
  // native-vs-spillover distinction already applies (see clampToWindow
  // usage below).
  const breakStart = shiftWindows[shift].breakStart;
  const breakStartInstant = breakStart ? sydneyInstant(dateStr, breakStart[0], breakStart[1]) : null;

  const [rows, addableTasks, prevRows, nextRows, breakRules] = await Promise.all([
    prisma.dailyRoster.findMany({
      where: { workDate, shift, rosterStatus: RosterStatus.PLANNED },
      include: { employee: { include: { department: true } } },
    }),
    prisma.task.findMany({
      where: { isActive: true, category: { not: TaskCategory.LEAVE } },
      orderBy: { sortOrder: "asc" },
    }),
    // The previous/next shift's own roster rows (same shape as `rows` above)
    // — just for name/employeeCode/department on whichever of their
    // movements turn out to be spilling into this shift's window (see
    // below).
    prisma.dailyRoster.findMany({
      where: { workDate: prevWorkDate, shift: prevShift, rosterStatus: RosterStatus.PLANNED },
      include: { employee: { include: { department: true } } },
    }),
    prisma.dailyRoster.findMany({
      where: { workDate: nextWorkDate, shift: nextShift, rosterStatus: RosterStatus.PLANNED },
      include: { employee: { include: { department: true } } },
    }),
    prisma.breakRule.findMany({ where: { isActive: true } }),
  ]);
  const prevRowById = new Map(prevRows.map((r) => [r.id, r]));
  const nextRowById = new Map(nextRows.map((r) => [r.id, r]));

  const [activeMovements, closedMovements, prevActiveMovements, prevClosedMovements, nextActiveMovements, nextClosedMovements] =
    await Promise.all([
      prisma.taskMovement.findMany({
        where: { dailyRosterId: { in: rows.map((r) => r.id) }, status: MovementStatus.ACTIVE },
        include: { task: true },
      }),
      // Everyone who has already moved off a task today still counts toward its
      // labour-hours total, so this is scoped by workDate/shift via the roster
      // relation rather than the PLANNED-only `rows` set above (it should still
      // count someone's worked minutes even if they were later marked absent
      // or removed from the roster). Fetched in full (not a groupBy sum) so
      // each movement's minutes can be clamped to this shift's window below —
      // covers the rare case of a closed movement manually edited past its
      // shift's own finish.
      prisma.taskMovement.findMany({
        where: { status: MovementStatus.CLOSED, dailyRoster: { workDate, shift } },
        select: {
          id: true,
          dailyRosterId: true,
          taskId: true,
          startTime: true,
          actualFinish: true,
          task: { select: { category: true } },
        },
      }),
      // Previous shift's movements still running past *their own* shift's
      // window — i.e. genuinely spilling into this one. The scheduledFinish
      // filter is what keeps this to only the overrunning subset rather than
      // the whole previous roster.
      prisma.taskMovement.findMany({
        where: {
          dailyRosterId: { in: prevRows.map((r) => r.id) },
          status: MovementStatus.ACTIVE,
          scheduledFinish: { gt: prevWindow.plannedFinish },
        },
        include: { task: true },
      }),
      prisma.taskMovement.findMany({
        where: {
          dailyRosterId: { in: prevRows.map((r) => r.id) },
          status: MovementStatus.CLOSED,
          actualFinish: { gt: prevWindow.plannedFinish },
        },
        select: { taskId: true, startTime: true, actualFinish: true },
      }),
      // Mirror of the above, the other direction: next shift's movements
      // that started before *their own* shift's window opens — i.e. an
      // early start genuinely spilling backward into this one.
      prisma.taskMovement.findMany({
        where: {
          dailyRosterId: { in: nextRows.map((r) => r.id) },
          status: MovementStatus.ACTIVE,
          startTime: { lt: nextWindow.plannedStart },
        },
        include: { task: true },
      }),
      prisma.taskMovement.findMany({
        where: {
          dailyRosterId: { in: nextRows.map((r) => r.id) },
          status: MovementStatus.CLOSED,
          startTime: { lt: nextWindow.plannedStart },
        },
        select: { taskId: true, startTime: true, actualFinish: true },
      }),
    ]);
  const movementByRosterId = new Map(activeMovements.map((m) => [m.dailyRosterId, m]));

  // Closed minutes per task, this shift's own window only — own-shift closed
  // movements plus whatever slice of the previous/next shift's closed
  // movements (that ran past/started before their own window) falls inside
  // this window.
  const closedMinutesMap = new Map<string, number>();
  let closedMinutesShiftTotal = 0;
  for (const m of [...closedMovements, ...prevClosedMovements, ...nextClosedMovements]) {
    const clamped = clampToWindow(m.startTime, m.actualFinish!, thisWindow.plannedStart, thisWindow.plannedFinish);
    if (!clamped) continue;
    const minutes = elapsedMinutes(clamped.start, clamped.finish);
    closedMinutesMap.set(m.taskId, (closedMinutesMap.get(m.taskId) ?? 0) + minutes);
    closedMinutesShiftTotal += minutes;
  }

  // Unpaid break deduction — native rows only (see comment above
  // breakStartInstant). Built from the same closed/active movements already
  // fetched, clamped to this shift's own window and grouped per employee,
  // so each person's own gross hours decide whether a break rule applies at
  // all before working out which movement(s) it comes off. Same
  // computeEmployeeBreakAllocation used by getTaskTimeline's per-task
  // detail modal and by reporting, so none of the three can disagree.
  const nativeMovementsByRosterId = new Map<string, MovementForBreakAllocation[]>();
  function addNativeMovement(id: string, rosterId: string, taskId: string, start: Date, finish: Date) {
    const clamped = clampToWindow(start, finish, thisWindow.plannedStart, thisWindow.plannedFinish);
    if (!clamped) return;
    const list = nativeMovementsByRosterId.get(rosterId) ?? [];
    list.push({ id, taskId, startTime: clamped.start, effectiveFinish: clamped.finish });
    nativeMovementsByRosterId.set(rosterId, list);
  }
  // LEAVE-category movements are excluded from gross hours entirely — no
  // work happened, so no meal break was earned or missed against them (same
  // rule as reporting.ts's buildLaborReportRows and getTaskTimeline).
  for (const m of closedMovements) {
    if (m.task.category === TaskCategory.LEAVE) continue;
    addNativeMovement(m.id, m.dailyRosterId, m.taskId, m.startTime, m.actualFinish!);
  }
  for (const m of activeMovements) {
    if (m.task.category === TaskCategory.LEAVE) continue;
    addNativeMovement(m.id, m.dailyRosterId, m.taskId, m.startTime, m.scheduledFinish);
  }

  const breakRuleTiers = breakRules.map((r) => ({
    isActive: r.isActive,
    minHoursWorked: Number(r.minHoursWorked),
    unpaidMinutes: r.unpaidMinutes,
  }));
  const breakDeductionByTask = new Map<string, number>();
  const breakInfoByRosterId = new Map<string, { grossMinutes: number; breakMinutes: number }>();
  for (const [rosterId, movements] of nativeMovementsByRosterId) {
    const { grossMinutes, breakMinutes, perMovement } = computeEmployeeBreakAllocation(
      movements,
      breakStartInstant,
      breakRuleTiers
    );
    breakInfoByRosterId.set(rosterId, { grossMinutes, breakMinutes });
    if (breakMinutes <= 0) continue;
    const perTask = sumDeductionsByTask(movements, perMovement);
    for (const [taskId, minutes] of perTask) {
      breakDeductionByTask.set(taskId, (breakDeductionByTask.get(taskId) ?? 0) + minutes);
    }
  }
  const totalBreakDeductionMinutes = Array.from(breakDeductionByTask.values()).reduce((a, b) => a + b, 0);

  const byTask = new Map<string, { taskName: string; sortOrder: number; group: BoardTaskGroup }>();
  let notYetLive = 0;
  let activeMinutesTotal = 0;

  function bucketFor(taskId: string, taskName: string, sortOrder: number) {
    const bucket = byTask.get(taskId) ?? {
      taskName,
      sortOrder,
      group: {
        taskId,
        taskName,
        entries: [],
        closedMinutesThisShift: closedMinutesMap.get(taskId) ?? 0,
        breakDeductionMinutes: breakDeductionByTask.get(taskId) ?? 0,
      },
    };
    byTask.set(taskId, bucket);
    return bucket;
  }

  for (const row of rows) {
    const movement = movementByRosterId.get(row.id);
    if (!movement) {
      notYetLive++;
      continue;
    }
    // Cap: this shift's own board only ever shows the slice of the movement
    // that falls inside its own window, even if scheduledFinish (approvedFinish
    // after an Extend Shift) reaches further — the remainder is the next
    // shift's spillover to show, not this one's to keep counting.
    const clamped = clampToWindow(
      movement.startTime,
      movement.scheduledFinish,
      thisWindow.plannedStart,
      thisWindow.plannedFinish
    );
    if (!clamped) continue;
    const bucket = bucketFor(movement.taskId, movement.task.name, movement.task.sortOrder);
    const breakInfo = breakInfoByRosterId.get(row.id);
    bucket.group.entries.push({
      dailyRosterId: row.id,
      firstName: row.employee.firstName,
      lastName: row.employee.lastName,
      employeeCode: row.employee.employeeCode,
      departmentName: row.employee.department?.name ?? null,
      startTime: clamped.start,
      scheduledFinish: clamped.finish,
      shiftGrossMinutes: breakInfo?.grossMinutes,
      shiftBreakMinutes: breakInfo?.breakMinutes,
    });
    activeMinutesTotal += elapsedMinutes(clamped.start, clamped.finish);
  }

  // Spillover-in: the previous shift's own movements that ran past its
  // window, clamped to *this* window — same task bucket. Tagged as OT only
  // when that row is actually flagged shiftExtended (Extend Shift, or the
  // "Overtime" mode of the bulk time-change tool) — a movement crossing the
  // shift-window boundary isn't itself proof of overtime, since an ad-hoc
  // custom-hours row (e.g. added via the casual pool, or a deliberate
  // "Shift change") can legitimately span two shifts by design.
  for (const movement of prevActiveMovements) {
    const prevRow = prevRowById.get(movement.dailyRosterId);
    if (!prevRow) continue;
    const clamped = clampToWindow(
      movement.startTime,
      movement.scheduledFinish,
      thisWindow.plannedStart,
      thisWindow.plannedFinish
    );
    if (!clamped) continue;
    const bucket = bucketFor(movement.taskId, movement.task.name, movement.task.sortOrder);
    bucket.group.entries.push({
      dailyRosterId: prevRow.id,
      firstName: prevRow.employee.firstName,
      lastName: prevRow.employee.lastName,
      employeeCode: prevRow.employee.employeeCode,
      departmentName: prevRow.employee.department?.name ?? null,
      startTime: clamped.start,
      scheduledFinish: clamped.finish,
      spillover: prevRow.shiftExtended ? { direction: "from", shift: prevShift } : undefined,
    });
    activeMinutesTotal += elapsedMinutes(clamped.start, clamped.finish);
  }

  // Spillover-in the other direction: the next shift's own movements that
  // started before its window opens, clamped to *this* window — someone
  // brought on early ahead of their own rostered shift.
  for (const movement of nextActiveMovements) {
    const nextRow = nextRowById.get(movement.dailyRosterId);
    if (!nextRow) continue;
    const clamped = clampToWindow(
      movement.startTime,
      movement.scheduledFinish,
      thisWindow.plannedStart,
      thisWindow.plannedFinish
    );
    if (!clamped) continue;
    const bucket = bucketFor(movement.taskId, movement.task.name, movement.task.sortOrder);
    bucket.group.entries.push({
      dailyRosterId: nextRow.id,
      firstName: nextRow.employee.firstName,
      lastName: nextRow.employee.lastName,
      employeeCode: nextRow.employee.employeeCode,
      departmentName: nextRow.employee.department?.name ?? null,
      startTime: clamped.start,
      scheduledFinish: clamped.finish,
      spillover: nextRow.shiftExtended ? { direction: "into", shift: nextShift } : undefined,
    });
    activeMinutesTotal += elapsedMinutes(clamped.start, clamped.finish);
  }

  const shiftTotalMinutes = Math.max(0, closedMinutesShiftTotal + activeMinutesTotal - totalBreakDeductionMinutes);

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
