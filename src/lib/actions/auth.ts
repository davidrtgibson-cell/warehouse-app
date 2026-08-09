"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createSession, destroySession } from "@/lib/auth";

// Called directly from LoginForm (client component) via a plain function
// call, not a <form action>, so it can throw a message the form displays
// inline — same split as every other client-invoked action in this app
// (see the doc comment above updateRosterTimesAction in
// lib/actions/roster.ts). Deliberately does NOT redirect() itself: a
// server action's redirect() thrown through a client-side try/catch reads
// as a generic error unless the caller specifically recognizes it, so the
// client navigates on success instead (see LoginForm.tsx) — sidesteps that
// gotcha entirely rather than working around it.
//
// Generic "Invalid email or password" on any failure — wrong email, wrong
// password, inactive user — so a failed attempt can't be used to enumerate
// which accounts exist.
export async function loginAction(email: string, password: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash))) {
    throw new Error("Invalid email or password");
  }
  await createSession(user.id);
}

// Plain <form action={logoutAction}> in the (app) layout header — no
// client JS needed, so redirect() here works exactly as Next.js intends
// (a real form submission, not a promise a client component is awaiting
// inside its own try/catch).
export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
