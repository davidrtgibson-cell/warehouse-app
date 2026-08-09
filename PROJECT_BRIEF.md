> Original project brief (2026-08-06) — the prompt that started this build. Kept verbatim here as the
> reference plan; check `git log` for what's actually been built against it rather than editing this
> file to track status.

# Warehouse Workforce Rostering, Timekeeping & Task-Movement App — Project Brief

## Purpose

Internal tool for warehouse leaders to manage where 150–200 employees are
deployed across a shift, track every task-to-task movement accurately, and
export labour-hour data for productivity reporting and costing.

**This tool does NOT process payroll.** The business already has separate
payroll systems. This app exists purely for reporting, visibility, and
accountability — tracking who worked what task for how long. The only
downstream requirement is that hours are cleanly exportable so another
system can apply cost assumptions (hours × AWR) and handle volumes/costing.
Because of this, keep pay-rule complexity out of this app entirely (see
"Explicitly out of scope" below).

## Environment & conventions

- Single site, desktop-browser use, 10–20 leaders using it concurrently
- Australia/Sydney timezone, Australian date conventions, 24-hour time
- Shifts: AM, PM, Night
- Employment types: permanent, part-time, casual, agency, contractor

## Recommended stack

- Next.js + TypeScript + React
- PostgreSQL
- Server-side API layer with role-based auth
- Tailwind CSS
- Database/API layer built so storage tech could change later without
  rewriting the UI

Don't blindly accept this — sanity check it briefly against the
requirements below, then proceed unless there's a material reason not to.

## Core concept: the live task deployment board

Not a traditional roster form — a live board. Leader selects work date +
shift, and sees task cards in a grid (e.g. GTP Picking, Manual Picking,
Indent Picking, Packing, Receiving, Putaway, VAS, Inventory, Break, etc.).

Each card shows: task name, current headcount, a compact scrollable list of
assigned employees with a checkbox beside each.

**Move Selected operation:** leader multi-selects employees across
different cards, picks a destination task, clicks Move Selected. This must,
as one atomic transaction:
- Capture one consistent movement timestamp
- Close each selected employee's current active movement (set actual
  finish = timestamp, calculate duration, status → Closed)
- Create a new active movement for the destination task, starting at the
  same timestamp
- Refresh headcounts immediately, clear selection, record who processed it

No drag-and-drop in v1 — reliable multi-select + move is the priority
(this was deliberately validated in discussion, not just copied from an
old spec).

**Task detail panel:** clicking a task name opens a table — Employee Name,
Start Time, Finish Time (shows "Active" if not finished), Time on Task
(live-calculated for active rows, never negative). Informational only;
selection/movement stays on the main board.

## Movement-time logic

Every movement has: start time, scheduled finish, actual finish, effective
finish, duration minutes, status (Active/Closed).

- Effective finish = actual_finish if present, else scheduled/approved
  shift finish. **An open record must never run indefinitely** just
  because nobody manually closed it — this is what makes reporting safe
  from a clock-drift bug.
- When someone moves at, say, 10:15: prior movement's actual finish =
  10:15; new movement's start = 10:15; new movement's scheduled finish =
  their approved shift finish (unchanged).
- **Only one active movement per employee per date/shift** — enforce this
  at the database/transaction level, not just in the UI.

## Rostering model — two layers

**Standard Roster:** recurring weekday pattern per employee (day, shift,
start, finish, paid hours, default task, effective-from/to dates,
active/inactive). Used for permanent/part-time staff so they don't need
manual daily entry.

**Daily Roster:** dated, generated from Standard Roster for a selected
date + shift (AM only / PM only / Night only / All). Generation must skip
duplicates and be idempotent. Fields: planned start/finish, approved
finish, default task, roster status, roster source (Standard Roster vs
Manual/Casual), standard-roster reference, override reason.

### Build Daily Roster screen (leader's pre-shift workflow)

Two things happening on one screen:
1. **Generate** — pull everyone with a standard-roster pattern for the
   selected date/shift into an editable list.
2. **Mark Absent / Leave** — per-row action on the generated list. Leave
   types: Annual Leave, Personal Leave, Other Leave, LWOP. Marking someone
   absent should create an actual leave transaction/movement record (model
   leave as a task category, same mechanism as Break — not a special case).
   Include an Undo.
3. **Casual/Agency pool panel** — search + filter by default shift, shows
   all active employees without a standard-roster pattern for that day
   (not a specially-flagged subset — simpler, at the cost of needing
   ongoing maintenance to mark leavers inactive). Multi-select, assign a
   task, add to the daily roster in one action (source = "Manual/Casual").
   Automatically excludes anyone already on the roster.

## Shift extension / overtime (kept deliberately light)

Approved finish initially = planned finish. An "Extend Shift" action lets
a leader change approved finish for one or more selected employees (and
update their active task's scheduled finish accordingly). Keep this
simple — a boolean + new finish time + optional note is enough. **Do not
build a formal multi-field overtime-approval workflow** (approved
by/reason/approval-timestamp) — that level of rigor belongs to payroll
systems, not this tool.

## Break handling

Standard unpaid breaks calculated via a **configurable** break-rules table
(e.g. ≥6 hours worked → deduct 30 unpaid minutes; under 6 hours → no
deduction), not hardcoded. Keep a Break task available for manual/
operational exceptions. Record the unpaid deduction separately rather than
silently shrinking a task's raw movement duration. Reporting should
distinguish gross attendance hours, unpaid break minutes, and net worked
hours.

## Explicitly OUT of scope (do not build)

- No pay-rules engine (no OT 1.5/2.0 multipliers, no weekday/Saturday/
  Sunday/public-holiday banding, no costed labour amount calculation)
- No payroll import/reconciliation/variance tracking
- No formal overtime-approval audit workflow beyond the lightweight
  Extend Shift note above
- If an "ordinary vs overtime" hours split in exports turns out to be
  useful later, that's a single configurable threshold, not a rules engine

## Admin-configurability (important — flagged explicitly in discussion)

Tasks, break rules, and any other list that will change over time must be
manageable through a simple admin screen (add/rename/retire/reorder) —
not hardcoded, not requiring a code change to update.

## Data model (trimmed from original spec)

Employees, Tasks (with a category: Productive / Indirect / Leave), Standard
Rosters, Daily Rosters, Task Movements, Break Rules, Productivity Volumes,
Exceptions/Audit (missing active task, duplicate active task, overlapping
movements, movement gaps, task time outside approved shift, corrections +
who made them). **No Pay Rules table, no Payroll Imports table.**

## Reporting (trimmed)

Exportable (CSV/Excel) report by employee and task: work date, shift,
employee, employment type, agency, task, department, direct/indirect,
first task start, last task finish, raw task minutes/hours, gross shift
hours, unpaid-break minutes, **net worked hours**. That last column is
what downstream tools multiply by AWR — everything upstream of it needs to
be accurate. No paid-hours/OT/payroll-variance/labour-cost columns — those
don't belong in this app. Filters: date range, shift, employee, task,
department, employment type, agency.

## Concurrency & data integrity

10–20 leaders may act simultaneously. Handle: two leaders moving the same
employee, stale board data, duplicate clicks, partial bulk-move failures
(rollback/clear errors), idempotent roster generation and shift loading,
audit logging. Bulk moves should be one controlled server transaction, not
many independent requests.

## Test data

150 synthetic employees (75 AM / 60 PM / 15 Night, 120 permanent / 30
part-time), at least 11 tasks, one week of standard rosters, sample daily
rosters, sample movements, sample break rules. Clearly synthetic names.

## How to work with me on this

I don't need rigid milestone gates — work through this iteratively, check
in as you go rather than stopping at fixed checkpoints. That said, build
in roughly this order since it's hardest to retrofit later: (1) schema +
seed data, (2) standard/daily roster generation, (3) the live board +
move transaction + concurrency handling, (4) task detail panel + shift
extension, (5) break-rules-aware reporting/export. Where something's
genuinely unclear, make the smallest reversible assumption, tell me what
you assumed, and keep moving rather than stopping to ask.

Start by proposing the database schema and getting a basic project
scaffold + seed script running so I can see it work locally.
