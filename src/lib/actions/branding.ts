"use server";

import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { refresh } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { BRANDING_SINGLETON_ID } from "@/lib/branding";

// Cosmetic white-labelling (BACKLOG.md Tier 5) — ADMIN-only, same as every
// other Settings action. Deliberately scoped small: one accent colour + one
// logo image, applied to a handful of spots (side nav header, active nav
// item, login page) rather than a full re-theme — see BrandingSettings'
// doc comment in schema.prisma.

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const ALLOWED_LOGO_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
  "image/webp": "webp",
};
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB — a logo has no business being bigger than this.

const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

// Deletes any existing logo file first (regardless of its extension) so
// switching from e.g. a .jpg to a .png doesn't leave the old file behind —
// there's only ever meant to be one current logo on disk.
async function deleteExistingLogoFile(existingLogoPath: string | null) {
  if (!existingLogoPath) return;
  const existingFile = path.join(process.cwd(), "public", existingLogoPath.replace(/^\//, ""));
  await unlink(existingFile).catch(() => {}); // fine if it's already gone
}

export async function updateBrandingAction(formData: FormData): Promise<void> {
  const actingUser = await requireAdmin();

  const rawColor = (formData.get("accentColor") as string | null)?.trim() || "";
  if (rawColor && !HEX_COLOR_RE.test(rawColor)) {
    throw new Error("Colour must be a 6-digit hex code, e.g. #2563eb");
  }
  const accentColor = rawColor || null;

  const existing = await prisma.brandingSettings.findUnique({ where: { id: BRANDING_SINGLETON_ID } });

  // The file input's a plain File even when nothing was chosen — an empty
  // (size 0) one — so "no new upload this save" is detected by size, not
  // just presence, and an existing logo is left untouched in that case.
  const logoFile = formData.get("logo");
  let logoPath = existing?.logoPath ?? null;
  if (logoFile instanceof File && logoFile.size > 0) {
    if (logoFile.size > MAX_LOGO_BYTES) throw new Error("Logo must be under 2 MB");
    const ext = ALLOWED_LOGO_TYPES[logoFile.type];
    if (!ext) throw new Error("Logo must be a PNG, JPEG, WebP, or SVG image");

    await deleteExistingLogoFile(existing?.logoPath ?? null);
    await mkdir(UPLOADS_DIR, { recursive: true });
    const bytes = Buffer.from(await logoFile.arrayBuffer());
    await writeFile(path.join(UPLOADS_DIR, `logo.${ext}`), bytes);
    logoPath = `/uploads/logo.${ext}`;
  }

  await prisma.$transaction(async (tx) => {
    await tx.brandingSettings.upsert({
      where: { id: BRANDING_SINGLETON_ID },
      create: { id: BRANDING_SINGLETON_ID, accentColor, logoPath },
      update: { accentColor, logoPath },
    });
    await tx.auditLog.create({
      data: {
        entityType: "BrandingSettings",
        entityId: BRANDING_SINGLETON_ID,
        action: "UPDATE_BRANDING",
        changes: { accentColor, logoPath },
        changedByUserId: actingUser.id,
      },
    });
  });

  refresh();
}

export async function removeLogoAction(): Promise<void> {
  const actingUser = await requireAdmin();

  const existing = await prisma.brandingSettings.findUnique({ where: { id: BRANDING_SINGLETON_ID } });
  if (!existing?.logoPath) return;

  await deleteExistingLogoFile(existing.logoPath);

  await prisma.$transaction(async (tx) => {
    await tx.brandingSettings.update({ where: { id: BRANDING_SINGLETON_ID }, data: { logoPath: null } });
    await tx.auditLog.create({
      data: {
        entityType: "BrandingSettings",
        entityId: BRANDING_SINGLETON_ID,
        action: "REMOVE_LOGO",
        changes: { removedLogoPath: existing.logoPath },
        changedByUserId: actingUser.id,
      },
    });
  });

  refresh();
}
