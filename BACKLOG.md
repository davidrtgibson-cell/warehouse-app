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
3. **Test framework for code & UI testing.** Nothing's set up yet — this whole build has been verified via
   manual dev-server checks and one-off scripts each session. Worth setting up sooner rather than later
   since the payoff compounds (every feature after it benefits), even though it doesn't unlock any new
   user-facing capability on its own. A reasonable place to start: Vitest or Jest for `src/lib/*` (pure
   functions like `break-rules.ts`, `schedule.ts`, `board-time.ts` are ideal unit-test targets already),
   Playwright for UI/end-to-end.
4. **User manual / help function.** Lowest priority — most valuable once the feature set and UI settle down
   more, so it doesn't need constant rewriting.
