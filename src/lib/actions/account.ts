"use server";

import { prisma } from "@/lib/db";
import { requireCurrentUser, createSession } from "@/lib/auth";
import { hashPassword, verifyPassword, validatePassword } from "@/lib/password";

// Self-service password change — for someone who still knows their current
// password (lost-password recovery stays admin-only, see the doc comment
// atop lib/actions/users.ts). Deliberately its own file rather than
// users.ts: this has to work for LEADER as well as ADMIN, whereas
// everything in users.ts is gated by requireAdmin().
//
// On success, every session for this user (including this device's) is
// torn down (same "a password change invalidates old sessions" reasoning
// as resetUserPasswordAction) and this device is immediately issued a
// fresh one via createSession() — so the person making the change stays
// signed in here, but a copy of the old cookie anywhere else stops working
// right away.
export async function changeOwnPasswordAction(currentPassword: string, newPassword: string): Promise<void> {
  const user = await requireCurrentUser();

  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new Error("Current password is incorrect");
  }
  validatePassword(newPassword);

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
    await tx.session.deleteMany({ where: { userId: user.id } });
    await tx.auditLog.create({
      data: {
        entityType: "User",
        entityId: user.id,
        action: "CHANGE_OWN_PASSWORD",
        changes: {},
        changedByUserId: user.id,
      },
    });
  });

  await createSession(user.id);
}
