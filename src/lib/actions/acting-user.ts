"use server";

import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { ACTING_USER_COOKIE } from "@/lib/auth";

// Picker-only scaffolding — see the SWAP NOTE in src/lib/auth.ts. This whole
// file goes away (replaced by real login) once session-based auth lands.
export async function setActingUser(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) {
    throw new Error("Unknown or inactive user");
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTING_USER_COOKIE, user.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}
