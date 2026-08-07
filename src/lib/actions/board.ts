"use server";

import { refresh } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCurrentUser } from "@/lib/auth";
import { closeActiveMovement, openMovement } from "@/lib/movement-core";
import { MovementStatus, RosterStatus, TaskCategory } from "@/generated/prisma/client";

// Called directly from the live board's client component (not a <form
// action>), so it takes plain arguments. Closes each row's current active
// movement and opens a new one on `taskId`, both at "now" — mirrors the
// brief's "Move Selected" flow. Rows with no active movement (finalize
// hasn't reached them yet) or already on the target task are silently
// skipped rather than failing the whole selection.
export async function moveSelectedToTask(dailyRosterIds: string[], taskId: string) {
  if (dailyRosterIds.length === 0) throw new Error("No rows selected");

  const actingUser = await requireCurrentUser();

  const task = await prisma.task.findFirst({
    where: { id: taskId, isActive: true, category: { not: TaskCategory.LEAVE } },
  });
  if (!task) throw new Error("Invalid task");

  const dailyRosters = await prisma.dailyRoster.findMany({
    where: { id: { in: dailyRosterIds }, rosterStatus: RosterStatus.PLANNED },
  });

  const activeMovements = await prisma.taskMovement.findMany({
    where: { dailyRosterId: { in: dailyRosters.map((d) => d.id) }, status: MovementStatus.ACTIVE },
  });
  const activeByRosterId = new Map(activeMovements.map((m) => [m.dailyRosterId, m]));

  let moved = 0;
  for (const dailyRoster of dailyRosters) {
    const active = activeByRosterId.get(dailyRoster.id);
    if (!active || active.taskId === task.id) continue;

    await prisma.$transaction(async (tx) => {
      await closeActiveMovement(tx, dailyRoster.id);
      await openMovement(tx, dailyRoster, task, actingUser.id, "MOVE_TASK");
    });
    moved++;
  }

  refresh();
  return { moved };
}
