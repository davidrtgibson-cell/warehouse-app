"use server";

import { refresh } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { hoursMinutesFromTimeValue, parseTimeString, timeValueFromHoursMinutes } from "@/lib/schedule";
import type { Shift } from "@/generated/prisma/client";

function hhmm(t: Date) {
  const { hours, minutes } = hoursMinutesFromTimeValue(t);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

// Called directly from ShiftHoursEditor (client component), not <form
// action>, so it takes plain arguments — same split as
// updateRosterTimesAction/updateRosterTaskAction (see the doc comment above
// those in lib/actions/roster.ts). requireAdmin (not requireCurrentUser) —
// everything under /settings is ADMIN-only, see requireAdmin's doc comment.
export async function updateShiftWindowAction(shift: Shift, startTimeStr: string, finishTimeStr: string) {
  const actingUser = await requireAdmin();

  const [startHours, startMinutes] = parseTimeString(startTimeStr);
  const [finishHours, finishMinutes] = parseTimeString(finishTimeStr);
  if (startHours === finishHours && startMinutes === finishMinutes) {
    throw new Error("Start and finish can't be the same time");
  }

  const existing = await prisma.shiftWindow.findUnique({ where: { shift } });
  if (!existing) throw new Error(`No ShiftWindow row for ${shift} — check migration/seed`);

  const startTime = timeValueFromHoursMinutes(startHours, startMinutes);
  const finishTime = timeValueFromHoursMinutes(finishHours, finishMinutes);

  await prisma.$transaction(async (tx) => {
    await tx.shiftWindow.update({ where: { shift }, data: { startTime, finishTime } });
    await tx.auditLog.create({
      data: {
        entityType: "ShiftWindow",
        entityId: shift,
        action: "UPDATE_SHIFT_WINDOW",
        changes: {
          shift,
          from: { startTime: hhmm(existing.startTime), finishTime: hhmm(existing.finishTime) },
          to: { startTime: startTimeStr, finishTime: finishTimeStr },
        },
        changedByUserId: actingUser.id,
      },
    });
  });

  refresh();
}

// Separate from updateShiftWindowAction (start/finish) since it's a
// distinct concern with its own inline control — a shift's scheduled
// unpaid-break start time, used by the break-deduction logic (see
// src/lib/break-rules.ts) to work out which task's hours the break comes
// out of. `null` clears it, falling that shift back to deducting from
// whichever task the person spent the most time on instead.
export async function updateShiftBreakTimeAction(shift: Shift, breakStartTimeStr: string | null) {
  const actingUser = await requireAdmin();

  const existing = await prisma.shiftWindow.findUnique({ where: { shift } });
  if (!existing) throw new Error(`No ShiftWindow row for ${shift} — check migration/seed`);

  const breakStartTime = breakStartTimeStr
    ? timeValueFromHoursMinutes(...parseTimeString(breakStartTimeStr))
    : null;

  await prisma.$transaction(async (tx) => {
    await tx.shiftWindow.update({ where: { shift }, data: { breakStartTime } });
    await tx.auditLog.create({
      data: {
        entityType: "ShiftWindow",
        entityId: shift,
        action: "UPDATE_SHIFT_BREAK_TIME",
        changes: {
          shift,
          from: { breakStartTime: existing.breakStartTime ? hhmm(existing.breakStartTime) : null },
          to: { breakStartTime: breakStartTimeStr },
        },
        changedByUserId: actingUser.id,
      },
    });
  });

  refresh();
}
