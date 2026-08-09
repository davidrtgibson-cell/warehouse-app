import type { Prisma } from "@/generated/prisma/client";
import { MovementStatus } from "@/generated/prisma/enums";

type TxClient = Prisma.TransactionClient;

// Closes whatever ACTIVE task movement (if any) exists for a roster row.
// Shared across lib/actions/roster.ts (mark absent, remove from roster,
// syncing an edited row's movement) and lib/actions/board.ts (move to a
// different task) — not itself a Server Action, just plain shared
// server-only logic, which is why it lives outside either 'use server'
// file (a 'use server' file may only export async functions callable as
// actions).
export async function closeActiveMovement(tx: TxClient, dailyRosterId: string, at: Date = new Date()) {
  const activeMovement = await tx.taskMovement.findFirst({
    where: { dailyRosterId, status: MovementStatus.ACTIVE },
  });
  if (!activeMovement) return;

  await tx.taskMovement.update({
    where: { id: activeMovement.id },
    data: {
      status: MovementStatus.CLOSED,
      actualFinish: at,
      durationMinutes: Math.round((at.getTime() - activeMovement.startTime.getTime()) / 60000),
    },
  });
}

// Opens a new ACTIVE movement. `startTime` is explicit rather than always
// "now" — finalizeRosterAction backdates it to the row's plannedStart (the
// whole shift going live at once), while moving/reassigning during a live
// shift uses the real current time.
export async function openMovement(
  tx: TxClient,
  dailyRoster: { id: string; employeeId: string; approvedFinish: Date },
  task: { id: string; name: string },
  actingUserId: string,
  action: string,
  startTime: Date = new Date()
) {
  await tx.taskMovement.create({
    data: {
      employeeId: dailyRoster.employeeId,
      dailyRosterId: dailyRoster.id,
      taskId: task.id,
      startTime,
      scheduledFinish: dailyRoster.approvedFinish,
      status: MovementStatus.ACTIVE,
      processedByUserId: actingUserId,
    },
  });

  await tx.auditLog.create({
    data: {
      entityType: "DailyRoster",
      entityId: dailyRoster.id,
      action,
      changes: { task: task.name },
      changedByUserId: actingUserId,
    },
  });
}
