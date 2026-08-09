> Post-phase-5 backlog — the user's own notes (2026-08-09), organized into priority tiers with rationale,
> refined 2026-08-09 after a follow-up round answering the open design questions below. All five phases
> from `PROJECT_BRIEF.md`'s original build order are done; everything below is new scope layered on top.
> Update this file as items are picked up/finished rather than tracking status anywhere else — `git log`
> has the history once something's done, so feel free to delete a line once its commit has landed rather
> than marking it "done" here. Tier 1 (real login + permission levels) is done as of 2026-08-09 — see
> `git log` for the two commits. Everything below is renumbered accordingly.

## Tier 2 — Core admin gaps (the app currently runs entirely on seed data for these)

1. **Task maintenance (Settings): add/remove tasks, plus a paid/unpaid flag.** `Task` is already
   schema-ready for add/remove (isActive/sortOrder), and `BreakRulesGrid`/`StandardRosterGrid` are direct
   templates for the CRUD UI. New field needed: **`isPaid` (or similar) on `Task`**, chiefly meaningful for
   `LEAVE`-category tasks — e.g. Personal Leave paid, Annual Leave flagged *not* paid in this app's sense
   (it's compensated via accrued balance through payroll, not through this app's worked-hours reporting),
   LWOP unpaid. Needs to flow into reporting (a paid/unpaid leave column or split).
   **Related latent gap surfaced by this:** a full day of `LEAVE`-category movements currently still counts
   as "gross hours worked" for break-rule eligibility (`src/lib/break-rules.ts`), which doesn't make sense —
   no work happened, so no meal break was "earned" or missed. Worth excluding `LEAVE` category from gross
   hours entirely when this item is built, not just adding the paid/unpaid label on top of the existing bug.
2. **Team member maintenance (Settings): add/remove, active/inactive, perm vs. temp/casual managed
   separately, temp→perm conversion.** Conversion flow should **prompt building a Standard Roster pattern**
   as part of itself (a casual has none). The "don't overwrite old data, know when it kicks in" requirement
   is **already solved** — `StandardRoster` already has `effectiveFrom`/`effectiveTo` and never overwrites
   in place (`upsertStandardRosterRowAction` closes the old row and opens a new one). This item reuses that
   existing versioning rather than building new effective-dating logic. Now that Settings is ADMIN-gated
   (Tier 1 #2), this screen and its actions should follow the same `requireAdmin()` pattern as
   break-rules/shifts/standard-roster/users.
3. **Planned leave (Settings) + unplanned leave (already works).** No visual treatment needed on the board
   (per the user). Concrete shape: a Settings page — pick a team member, first/last leave dates, leave
   type — that doesn't touch already-generated `DailyRoster` rows directly. Instead, it needs a new small
   table (e.g. `PlannedLeave`: employeeId, taskId, dateFrom, dateTo) that
   **`generateDailyRosterFromStandard` checks at generation time**: for a date the employee has planned
   leave covering, generate their `DailyRoster` row with `defaultTaskId` set to the leave task instead of
   their Standard Roster task — so they're pre-flagged before the shift is even built, no same-day "mark
   absent" step needed. Unplanned leave (sick, goes home mid-shift) is **already fully supported** —
   that's just a live-board Move to a Leave task (or `markAbsentAction` for a whole day), no new work.

## Tier 3 — Efficiency on what's already built

4. **Standard Roster streamlining** — for a full-time pattern, entering the first day's shift time should
   default the rest of the week to match (still editable per day). `StandardRosterGrid.tsx` already has the
   per-day editing; this is a "smart default," not new mechanics — low risk, clear win for the stated goal
   of minimizing ongoing admin.
5. **Select-all on the roster builder.** Already exists in a small form today (`SelectAllCheckbox` next to
   the search box on `/roster/build`) — worth clarifying what's actually missing (more prominent placement?
   a different action it should drive?) before assuming this is a from-scratch gap.
6. **Optimize `/roster/build` layout** — the user's own framing: "functionality good, layout maybe not."
   Worth a dedicated look now that the page has grown across several sessions (generate, finalise, headcount,
   casual pool, search, bulk actions, per-row inline edits, and now the bulk time-change tool all live on one
   screen).

## Tier 4 — Structure / navigation

7. **Login page → home page → rest of the app.** Login and permission levels (formerly Tier 1) are both
   done — a home page in front of everything else with a card per section, filtered to what that user's
   authorization level can see (ADMIN vs LEADER, per `requireAdmin()`/the settings layout gate) is now
   unblocked. The live board stays at its own route; the home page sits in front, it doesn't replace it.
8. **Side nav instead of the current top nav bar** — natural to pair with #7, since both are about overall
   app navigation/IA. Worth doing together rather than as two separate passes.

## Tier 5 — Growth / polish

9. **Reporting: report builder.** Already flagged as a deliberate "nice to have, later" when phase 5 shipped
   — a UI to pick your own columns/groupings/filters rather than the fixed by-task/by-person views. Worth
   revisiting once there's a sense of what shapes people actually reach for in the current `/reports`.
10. **Style/branding settings** — company colour codes + logo, logo shown in the currently-empty right side
    of the header, colours applied through the UI. Mostly cosmetic/white-labelling; matches the
    "build for scalability, even potential sale" goal but doesn't block anything functional.
11. **Test framework for code & UI testing.** Nothing's set up yet — this whole build has been verified via
    manual dev-server checks and one-off scripts each session. Worth setting up sooner rather than later
    since the payoff compounds (every feature after it benefits), even though it doesn't unlock any new
    user-facing capability on its own. A reasonable place to start: Vitest or Jest for `src/lib/*` (pure
    functions like `break-rules.ts`, `schedule.ts`, `board-time.ts` are ideal unit-test targets already),
    Playwright for UI/end-to-end.
12. **User manual / help function.** Lowest priority — most valuable once the feature set and UI settle down
    more, so it doesn't need constant rewriting.
