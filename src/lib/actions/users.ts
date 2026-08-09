"use server";

import { refresh } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { UserRole } from "@/generated/prisma/client";

// User maintenance (BACKLOG.md item #2) — add/remove (soft, via isActive,
// same convention as Task/BreakRule/Employee), set role, reset password.
// All actions here require ADMIN (see requireAdmin's doc comment in
// src/lib/auth.ts) — this is the one Settings section that, unlike
// break-rules/shifts/standard-roster, can grant or revoke ADMIN itself, so
// it's exactly where that boundary matters most.
//
// There's no self-service "forgot password" flow (see the non-goals list in
// the original login-auth plan) — an admin sets the initial password on
// create and can set a new one via resetUserPasswordAction; communicating
// it to the user happens outside the app, same as the seeded dev password.

const MIN_PASSWORD_LENGTH = 8;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validatePassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
}

export async function createUserAction(name: string, email: string, password: string, role: UserRole) {
  const actingUser = await requireAdmin();

  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("Name is required");
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !normalizedEmail.includes("@")) throw new Error("A valid email is required");
  validatePassword(password);

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) throw new Error("A user with that email already exists");

  const passwordHash = await hashPassword(password);

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name: trimmedName, email: normalizedEmail, passwordHash, role },
    });
    await tx.auditLog.create({
      data: {
        entityType: "User",
        entityId: user.id,
        action: "CREATE_USER",
        changes: { name: trimmedName, email: normalizedEmail, role },
        changedByUserId: actingUser.id,
      },
    });
  });

  refresh();
}

export async function updateUserRoleAction(id: string, role: UserRole) {
  const actingUser = await requireAdmin();

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new Error("User not found");

  // Guard against locking everyone out of admin-only screens: refuse to
  // demote the last active ADMIN (self or otherwise).
  if (existing.role === "ADMIN" && role !== "ADMIN") {
    const otherActiveAdmins = await prisma.user.count({
      where: { role: "ADMIN", isActive: true, id: { not: id } },
    });
    if (otherActiveAdmins === 0) {
      throw new Error("Can't remove the last admin — promote another user first");
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { role } });
    await tx.auditLog.create({
      data: {
        entityType: "User",
        entityId: id,
        action: "UPDATE_USER_ROLE",
        changes: { from: existing.role, to: role },
        changedByUserId: actingUser.id,
      },
    });
  });

  refresh();
}

// Soft delete only — same isActive convention as Task/BreakRule/Employee.
// A deactivated user's existing sessions stop working immediately
// (getCurrentUser checks isActive on every request) even without a
// separate session-revocation step.
export async function setUserActiveAction(id: string, isActive: boolean) {
  const actingUser = await requireAdmin();

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new Error("User not found");

  if (id === actingUser.id && !isActive) {
    throw new Error("You can't deactivate your own account");
  }
  if (existing.role === "ADMIN" && !isActive) {
    const otherActiveAdmins = await prisma.user.count({
      where: { role: "ADMIN", isActive: true, id: { not: id } },
    });
    if (otherActiveAdmins === 0) {
      throw new Error("Can't deactivate the last admin — promote another user first");
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { isActive } });
    if (!isActive) {
      // Belt-and-braces on top of the isActive check in getCurrentUser —
      // kills any session outright rather than relying solely on that
      // per-request check.
      await tx.session.deleteMany({ where: { userId: id } });
    }
    await tx.auditLog.create({
      data: {
        entityType: "User",
        entityId: id,
        action: isActive ? "REACTIVATE_USER" : "DEACTIVATE_USER",
        changes: { name: existing.name },
        changedByUserId: actingUser.id,
      },
    });
  });

  refresh();
}

export async function resetUserPasswordAction(id: string, newPassword: string) {
  const actingUser = await requireAdmin();
  validatePassword(newPassword);

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new Error("User not found");

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { passwordHash } });
    // Force re-login everywhere — a password reset (e.g. after a suspected
    // leak) should invalidate any session issued under the old password.
    await tx.session.deleteMany({ where: { userId: id } });
    await tx.auditLog.create({
      data: {
        entityType: "User",
        entityId: id,
        action: "RESET_USER_PASSWORD",
        changes: { name: existing.name },
        changedByUserId: actingUser.id,
      },
    });
  });

  refresh();
}
