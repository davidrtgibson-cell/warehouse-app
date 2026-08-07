import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import type { User } from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// Placeholder auth
//
// There is no real authentication yet (see the User model notes in
// schema.prisma). Until then, "who is acting right now" is an "Acting as"
// cookie the user picks from a dropdown of seeded leaders/admins.
//
// This file is the ONLY place that is allowed to know how the current user
// is resolved. Every mutation elsewhere calls getCurrentUser() or
// requireCurrentUser() — never next/headers' cookies() directly — so that
// swapping in real session-based auth later only means rewriting the body
// of these two functions.
//
// SWAP NOTE (read this when building real auth):
//   - getCurrentUser()/requireCurrentUser() should keep this exact shape
//     (return User | null; throw on missing session) so call sites in
//     lib/actions/*.ts and page components do not need to change.
//   - ACTING_USER_COOKIE, listActingUsers(), and everything in
//     lib/actions/acting-user.ts + components/ActingAsPicker.tsx are
//     picker-only scaffolding. Delete them outright — don't adapt them —
//     and replace with a real login form + session creation.
//   - requireCurrentUser() currently throws when nobody is selected. A real
//     login flow will more likely want to redirect() to a sign-in page
//     instead of throwing; callers don't rely on the throw behavior beyond
//     "the promise rejects", so this is safe to change in one place.
//   - There is no authorization (role-based permission checking) anywhere
//     yet — any acting LEADER or ADMIN can call every action. That's net
//     new work for the real auth pass, not just a swap of this file.
//   - The cookie is a bare user id with no signature, so it's trivially
//     editable via devtools to "become" any seeded user. That's expected
//     for a dev placeholder with no security boundary — not a bug to fix
//     here.
// ---------------------------------------------------------------------------

export const ACTING_USER_COOKIE = "actingUserId";

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const userId = cookieStore.get(ACTING_USER_COOKIE)?.value;
  if (!userId) return null;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) return null;
  return user;
}

export async function requireCurrentUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('No acting user selected. Choose one from the "Acting as" picker.');
  }
  return user;
}

// Picker-only: the list of users selectable as "acting as". Gone once real
// auth lands (see SWAP NOTE above).
export async function listActingUsers() {
  return prisma.user.findMany({
    where: { isActive: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
}
