import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import type { User } from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// Session-based auth.
//
// The cookie holds a random opaque token; only its SHA-256 hash is ever
// stored (in Session.tokenHash) — same reasoning as password hashing
// (src/lib/password.ts), applied to the session token, so a database read
// alone can't be replayed as a valid session.
//
// This file is the ONLY place that is allowed to know how the current user
// is resolved. Every mutation elsewhere calls getCurrentUser() or
// requireCurrentUser() — never next/headers' cookies() directly.
//
// requireCurrentUser() keeps its original contract (throws when there's no
// user) rather than redirecting, so none of the many existing call sites
// across lib/actions/*.ts need to change — they already catch the throw and
// surface it inline. Real page-level "you must be logged in to see this at
// all" protection is handled once, in src/app/(app)/layout.tsx, not here.
//
// Role-based authorization (what a LEADER vs ADMIN can/can't do) doesn't
// exist yet — see BACKLOG.md item #2. Any signed-in user can call every
// action, same as before; this pass is only about proving who's signed in.
// ---------------------------------------------------------------------------

const SESSION_COOKIE = "session";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Called from loginAction (src/lib/actions/auth.ts) once a password's been
// verified. Creates the session row and sets the cookie in one step so
// callers can't do one without the other.
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await prisma.session.create({ data: { userId, tokenHash, expiresAt } });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

// Called from logoutAction. Deletes the session row (not just the cookie) —
// a leaked/copied cookie stops working immediately, not just on this device.
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;
  if (!session.user.isActive) return null;
  return session.user;
}

export async function requireCurrentUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Your session has expired — please sign in again.");
  }
  return user;
}
