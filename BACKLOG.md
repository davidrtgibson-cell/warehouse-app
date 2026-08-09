> Post-phase-5 backlog — the user's own notes (2026-08-09), organized into priority tiers with rationale,
> refined 2026-08-09 after a follow-up round answering the open design questions below. All five phases
> from `PROJECT_BRIEF.md`'s original build order are done; everything below is new scope layered on top.
> Update this file as items are picked up/finished rather than tracking status anywhere else — `git log`
> has the history once something's done, so feel free to delete a line once its commit has landed rather
> than marking it "done" here.

## Tier 1 — Foundational (real auth; blocks the home page and proper permission levels)

1. **Complete login functionality.** The "Acting as" picker (`src/lib/auth.ts`) has been a documented
   placeholder since the very first session — no password, a plain cookie holding a user id. This is the
   one item everything security-related sits on top of, and the codebase's own SWAP NOTE in `auth.ts`
   describes exactly what needs replacing. Also now a hard prerequisite for #9 (home page) — see there.
2. **User maintenance (Settings): add/remove users, permission levels.** Pairs directly with #1 — role-based
   authorization doesn't really exist yet either ("any acting LEADER or ADMIN can call every action" per
   `auth.ts`), so permission levels as a concept needs real auth underneath them to mean anything.

## Tier 2 — Core admin gaps (the app currently runs entirely on seed data for these)

3. **Task maintenance (Settings): add/remove tasks, plus a paid/unpaid flag.** `Task` is already
   schema-ready for add/remove (isActive/sortOrder), and `BreakRulesGrid`/`StandardRosterGrid` are direct
   templates for the CRUD UI. New field needed: **`isPaid` (or similar) on `Task`**, chiefly meaningful for
   `LEAVE`-category tasks — e.g. Personal Leave paid, Annual Leave flagged *not* paid in this app's sense
   (it's compensated via accrued balance through payroll, not through this app's worked-hours reporting),
   LWOP unpaid. Needs to flow into reporting (a paid/unpaid leave column or split).
   **Related latent gap surfaced by this:** a full day of `LEAVE`-category movements currently still counts
   as "gross hours worked" for break-rule eligibility (`src/lib/break-rules.ts`), which doesn't make sense —
   no work happened, so no meal break was "earned" or missed. Worth excluding `LEAVE` category from gross
   hours entirely when this item is built, not just adding the paid/unpaid label on top of the existing bug.
4. **Team member maintenance (Settings): add/remove, active/inactive, perm vs. temp/casual managed
   separately, temp→perm conversion.** Conversion flow should **prompt building a Standard Roster pattern**
   as part of itself (a casual has none). The "don't overwrite old data, know when it kicks in" requirement
   is **already solved** — `StandardRoster` already has `effectiveFrom`/`effectiveTo` and never overwrites
   in place (`upsertStandardRosterRowAction` closes the old row and opens a new one). This item reuses that
   existing versioning rather than building new effective-dating logic.
5. **Planned leave (Settings) + unplanned leave (already works).** No visual treatment needed on the board
   (per the user). Concrete shape: a Settings page — pick a team member, first/last leave dates, leave
   type — that doesn't touch already-generated `DailyRoster` rows directly. Instead, it needs a new small
   table (e.g. `PlannedLeave`: employeeId, taskId, dateFrom, dateTo) that
   **`generateDailyRosterFromStandard` checks at generation time**: for a date the employee has planned
   leave covering, generate their `DailyRoster` row with `defaultTaskId` set to the leave task instead of
   their Standard Roster task — so they're pre-flagged before the shift is even built, no same-day "mark
   absent" step needed. Unplanned leave (sick, goes home mid-shift) is **already fully supported** —
   that's just a live-board Move to a Leave task (or `markAbsentAction` for a whole day), no new work.

## Tier 3 — Efficiency on what's already built

6. **Standard Roster streamlining** — for a full-time pattern, entering the first day's shift time should
   default the rest of the week to match (still editable per day). `StandardRosterGrid.tsx` already has the
   per-day editing; this is a "smart default," not new mechanics — low risk, clear win for the stated goal
   of minimizing ongoing admin.
7. **Select-all on the roster builder.** Already exists in a small form today (`SelectAllCheckbox` next to
   the search box on `/roster/build`) — worth clarifying what's actually missing (more prominent placement?
   a different action it should drive?) before assuming this is a from-scratch gap.
8. **Optimize `/roster/build` layout** — the user's own framing: "functionality good, layout maybe not."
   Worth a dedicated look now that the page has grown across several sessions (generate, finalise, headcount,
   casual pool, search, bulk actions, per-row inline edits, and now the bulk time-change tool all live on one
   screen).

## Tier 4 — Structure / navigation

9. **Login page → home page → rest of the app.** Confirmed order: login first (needs #1 built), then a
   home page in front of everything else with a card per section, **filtered to what that user's
   authorization level can see** (needs #2's permission levels) — so this item is genuinely blocked on
   Tier 1, not just related to it. The live board stays at its own route; the home page sits in front,
   it doesn't replace it.
10. **Side nav instead of the current top nav bar** — natural to pair with #9, since both are about overall
    app navigation/IA. Worth doing together rather than as two separate passes.

## Tier 5 — Growth / polish

11. **Reporting: report builder.** Already flagged as a deliberate "nice to have, later" when phase 5 shipped
    — a UI to pick your own columns/groupings/filters rather than the fixed by-task/by-person views. Worth
    revisiting once there's a sense of what shapes people actually reach for in the current `/reports`.
12. **Style/branding settings** — company colour codes + logo, logo shown in the currently-empty right side
    of the header, colours applied through the UI. Mostly cosmetic/white-labelling; matches the
    "build for scalability, even potential sale" goal but doesn't block anything functional.
13. **Test framework for code & UI testing.** Nothing's set up yet — this whole build has been verified via
    manual dev-server checks and one-off scripts each session. Worth setting up sooner rather than later
    since the payoff compounds (every feature after it benefits), even though it doesn't unlock any new
    user-facing capability on its own. A reasonable place to start: Vitest or Jest for `src/lib/*` (pure
    functions like `break-rules.ts`, `schedule.ts`, `board-time.ts` are ideal unit-test targets already),
    Playwright for UI/end-to-end.
14. **User manual / help function.** Lowest priority — most valuable once the feature set and UI settle down
    more, so it doesn't need constant rewriting.
