import { prisma } from "@/lib/db";

// Singleton row id — see the BrandingSettings doc comment in schema.prisma.
export const BRANDING_SINGLETON_ID = "singleton";

export type Branding = {
  accentColor: string | null;
  logoPath: string | null;
  updatedAt: Date | null;
};

const DEFAULT_BRANDING: Branding = { accentColor: null, logoPath: null, updatedAt: null };

// Used by both the (app) layout and the public login page — plain read, no
// auth required, since it's cosmetic and the login page itself needs it
// before anyone's signed in.
export async function getBranding(): Promise<Branding> {
  const row = await prisma.brandingSettings.findUnique({ where: { id: BRANDING_SINGLETON_ID } });
  if (!row) return DEFAULT_BRANDING;
  return { accentColor: row.accentColor, logoPath: row.logoPath, updatedAt: row.updatedAt };
}
