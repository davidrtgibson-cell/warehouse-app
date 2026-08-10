> Post-phase-5 backlog — the user's own notes (2026-08-09), organized into priority tiers with rationale,
> refined 2026-08-09 after a follow-up round answering the open design questions below. All five phases
> from `PROJECT_BRIEF.md`'s original build order are done; everything below is new scope layered on top.
> Update this file as items are picked up/finished rather than tracking status anywhere else — `git log`
> has the history once something's done, so feel free to delete a line once its commit has landed rather
> than marking it "done" here. Tiers 1–4 are all fully done as of 2026-08-09/10 — see `git log`. Only
> Tier 5 (growth/polish) is left, renumbered accordingly below.

## Tier 5 — Growth / polish

1. **Reporting: report builder.** Already flagged as a deliberate "nice to have, later" when phase 5 shipped
   — a UI to pick your own columns/groupings/filters rather than the fixed by-task/by-person views. Worth
   revisiting once there's a sense of what shapes people actually reach for in the current `/reports`.
2. **Style/branding settings** — company colour codes + logo, applied through the UI (the side nav's
   "Warehouse App" wordmark at the top, per Tier 4 #10, is the natural spot for a logo now — the old
   top-nav-bar framing of this item is stale). Mostly cosmetic/white-labelling; matches the "build for
   scalability, even potential sale" goal but doesn't block anything functional.
3. **User manual / help function.** Lowest priority — most valuable once the feature set and UI settle down
   more, so it doesn't need constant rewriting.
4. **Reports: default to the immediately-previous shift (2026-08-10).** `/reports` currently defaults `from`/`to`
   to the last 7 days with no shift filter (`src/app/(app)/reports/page.tsx`). Most common real use is
   end-of-shift reporting, so it should default to whichever shift just ended — same "what's adjacent to
   right now" computation `schedule.ts` already has for the live board (`currentShiftAndDateFor`/
   `previousShiftAndDate`), just applied here instead.
5. **Build roster: default dates to the immediately-next shift (2026-08-10).** `/roster/build` currently
   defaults to the most recent date that already has a roster (`resolveWorkDate` in `schedule.ts`) —
   backward-looking. Most common real use is building the *next* shift ahead of time, so the no-param
   default should look forward instead, mirroring #4 above in the opposite direction.
6. **New employee → prompt to build their Standard Roster; maybe consolidate the two pages (2026-08-10).**
   Adding a PERMANENT or PART_TIME employee via Settings > Employees today is a dead end for actually
   rostering them — Standard Roster is a fully separate page/flow with zero link between the two. Should
   at minimum prompt/redirect into Standard Roster right after creating one of these employee types (CASUAL/
   AGENCY/CONTRACTOR don't need one). Open design question before building: a prompt/link between the two
   existing pages, or an actual merge into one combined employee+pattern screen — worth deciding deliberately
   rather than defaulting to whichever's less work.
7. **Production bootstrap: a way to create the first ADMIN user outside of `prisma/seed.ts` (2026-08-10).**
   Surfaced while planning the move off dev — the *only* way to create a `User` right now is Settings > Users,
   which requires already being signed in as an ADMIN (chicken-and-egg on a fresh database), and the only
   existing user-creation path outside the app is `prisma/seed.ts`, which is dev/demo-only (wipes every table,
   synthetic data, shared `changeme123` password) and unsafe to run against real data. Needed before any real
   deployment can have its first admin. Likely shape: a small idempotent CLI script (`tsx scripts/create-admin.ts`,
   same pattern as `seed.ts` but additive-only — refuses to run if an ADMIN already exists) rather than an
   in-app "first run" wizard, since this only ever needs to happen once per deployment and the operator is
   already comfortable running scripts.
