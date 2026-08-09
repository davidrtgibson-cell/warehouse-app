"use server";

import { refresh } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCurrentUser } from "@/lib/auth";
import { hoursMinutesFromTimeValue, parseTimeString, timeValueFromHoursMinutes } from "@/lib/schedule";
import type { Shift } from "@/generated/prisma/client";

function hhmm(t: Date) {
  const { hours, minutes } = hoursMinutesFromTimeValue(t);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

// Called directly from ShiftHoursEditor (client component), not <form
// action>, so it takes plain arguments — same split as
// updateRosterTimesAction/updateRosterTaskAction (see the doc comment above
// those in lib/actions/roster.ts). No role check beyond requireCurrentUser
// — this app has no role-based authorization anywhere yet (see auth.ts),
// so gating this one action differently would be inventing a new
// authorization layer inconsistent with every other mutation.
export async function updateShiftWindowAction(shift: Shift, startTimeStr: string, finishTimeStr: string) {
  const actingUser = await requireCurrentUser();

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
