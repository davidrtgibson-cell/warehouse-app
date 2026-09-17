"use client";

import { useRef, useState, useTransition } from "react";
import { updateBrandingAction, removeLogoAction } from "@/lib/actions/branding";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";

// Client-driven (startTransition + try/catch, matching TaskManagementGrid's
// EditTaskForm) rather than a plain <form action> for the Save button
// specifically — bad hex codes / oversized files are realistic mistakes
// here, and a plain form action throwing surfaces as a generic error
// overlay rather than the inline message this needs. "Remove logo" stays a
// plain <form action={removeLogoAction}> + ConfirmSubmitButton, matching
// every other destructive-ish action in this app — it has nothing to
// validate, so there's nothing an inline error would add.
export function BrandingSettingsForm({
  initialAccentColor,
  currentLogoSrc,
}: {
  initialAccentColor: string | null;
  currentLogoSrc: string | null;
}) {
  const [accentColor, setAccentColor] = useState(initialAccentColor ?? "");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function save() {
    setError(null);
    setSaved(false);
    const formData = new FormData();
    formData.set("accentColor", accentColor);
    const file = fileInputRef.current?.files?.[0];
    if (file) formData.set("logo", file);

    startTransition(async () => {
      try {
        await updateBrandingAction(formData);
        setSaved(true);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Accent colour</label>
        <p className="mt-1 text-xs text-zinc-500">
          Applied to the side nav header, the active nav item, and the login page — not a full re-theme of
          every button. Pick a colour dark/saturated enough for white text; leave blank for the default
          neutral styling.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="color"
            value={accentColor || "#18181b"}
            disabled={isPending}
            onChange={(e) => setAccentColor(e.target.value)}
            className="h-9 w-14 rounded border border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-950"
          />
          <input
            type="text"
            placeholder="#2563eb"
            value={accentColor}
            disabled={isPending}
            onChange={(e) => setAccentColor(e.target.value)}
            className="w-32 rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm font-mono dark:border-zinc-700 dark:bg-zinc-950"
          />
          {accentColor && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => setAccentColor("")}
              className="text-xs text-zinc-500 hover:underline"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Logo</label>
        <p className="mt-1 text-xs text-zinc-500">
          Shown in the side nav header and on the login page in place of the plain wordmark. PNG, JPEG,
          WebP, or SVG, up to 2 MB.
        </p>
        {currentLogoSrc && (
          <div className="mt-2 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- admin-uploaded file on disk, not a static/optimizable asset */}
            <img
              src={currentLogoSrc}
              alt="Current logo"
              className="h-12 w-auto rounded border border-zinc-200 bg-white p-1 dark:border-zinc-800"
            />
            <form action={removeLogoAction}>
              <ConfirmSubmitButton
                confirmMessage="Remove the current logo? The side nav and login page fall back to the plain wordmark."
                className="text-xs text-red-700 hover:underline dark:text-red-400"
              >
                Remove logo
              </ConfirmSubmitButton>
            </form>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          disabled={isPending}
          className="mt-2 block text-sm"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && !error && <p className="text-sm text-emerald-600">Saved.</p>}

      <button
        type="button"
        disabled={isPending}
        onClick={save}
        className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        {isPending ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
