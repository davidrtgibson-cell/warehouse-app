import { prisma } from "@/lib/db";

// Singleton row id — see the BrandingSettings doc comment in schema.prisma.
export const BRANDING_SINGLETON_ID = "singleton";

export type Branding = {
  accentColor: string | null;
  logoPath: string | null;
  // Same file as logoPath, but with a cache-busting query string appended —
  // render <img> tags with this, not logoPath directly. logo.<ext> is a
  // fixed filename (see updateBrandingAction in lib/actions/branding.ts), so
  // without this a browser/CDN/Next.js that already cached a response for
  // that exact URL (including a 404 from before any logo was ever uploaded)
  // keeps serving the stale response after the file changes on disk.
  logoSrc: string | null;
  updatedAt: Date | null;
};

const DEFAULT_BRANDING: Branding = { accentColor: null, logoPath: null, logoSrc: null, updatedAt: null };

// Used by both the (app) layout and the public login page — plain read, no
// auth required, since it's cosmetic and the login page itself needs it
// before anyone's signed in.
export async function getBranding(): Promise<Branding> {
  const row = await prisma.brandingSettings.findUnique({ where: { id: BRANDING_SINGLETON_ID } });
  if (!row) return DEFAULT_BRANDING;
  const logoSrc = row.logoPath ? `${row.logoPath}?v=${row.updatedAt.getTime()}` : null;
  return { accentColor: row.accentColor, logoPath: row.logoPath, logoSrc, updatedAt: row.updatedAt };
}
