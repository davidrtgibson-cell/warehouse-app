import Link from "next/link";
import { getBranding } from "@/lib/branding";
import { BrandingSettingsForm } from "@/components/BrandingSettingsForm";

export const dynamic = "force-dynamic";

export default async function BrandingSettingsPage() {
  const branding = await getBranding();

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans dark:bg-black dark:text-zinc-50">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <Link href="/settings" className="text-sm text-zinc-500 hover:underline">
            ← Settings
          </Link>
          <h1 className="text-2xl font-semibold">Branding</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Cosmetic white-labelling — one accent colour and one logo, shared across the whole app (this
            isn&apos;t per-user).
          </p>
        </div>
        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <BrandingSettingsForm initialAccentColor={branding.accentColor} currentLogoPath={branding.logoPath} />
        </section>
      </div>
    </div>
  );
}
