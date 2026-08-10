import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";

// User manual (BACKLOG.md Tier 5) — one static reference page rather than
// per-screen sub-pages: this app has ~15 screens, most a paragraph or two
// of real guidance, and a single page means adding a new section never
// needs a nav-link change elsewhere. Anchored sections + a top table of
// contents stand in for that per-page nav instead. Deliberately no DB
// queries — pure static content, so no dynamic="force-dynamic" needed.
//
// Visible to both LEADER and ADMIN (unlike Settings, which is admin-only)
// — most of this covers day-to-day live board/roster/reports workflows
// either role uses; admin-only sections are labelled as such rather than
// hidden, since a LEADER should still be able to read what an admin
// screen does even if they can't reach it themselves.

const TOC = [
  { href: "#overview", label: "Overview & roles" },
  { href: "#daily-flow", label: "A shift, start to finish" },
  { href: "#live-board", label: "Live board" },
  { href: "#roster", label: "Roster (view)" },
  { href: "#build-roster", label: "Build roster" },
  { href: "#reports", label: "Reports" },
  { href: "#settings", label: "Settings (admin)" },
  { href: "#faq", label: "Common questions" },
];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-8 space-y-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">{children}</div>
    </section>
  );
}

function SubHeading({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h3 id={id} className="scroll-mt-8 pt-1 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
      {children}
    </h3>
  );
}

export default async function HelpPage() {
  const currentUser = await getCurrentUser();
  const isAdmin = currentUser?.role === "ADMIN";

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans dark:bg-black dark:text-zinc-50">
      <div className="mx-auto max-w-3xl space-y-8">
        <div>
          <h1 className="text-2xl font-semibold">Help &amp; user guide</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            What each screen does and how the day-to-day workflows fit together. This covers the app as
            it stands today — if something here doesn&apos;t match what you see on screen, the screen is
            the source of truth.
          </p>
        </div>

        <nav className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">On this page</div>
          <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
            {TOC.map((t) => (
              <li key={t.href}>
                <a href={t.href} className="text-zinc-700 hover:underline dark:text-zinc-300">
                  {t.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <Section id="overview" title="Overview & roles">
          <p>
            This app tracks where your team is deployed across a shift — who&apos;s doing what task,
            right now — and turns that into labour-hours reporting. It doesn&apos;t run payroll; it
            produces the hours another system multiplies by a wage rate.
          </p>
          <p>Two roles, set per person on the Users screen:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <span className="font-medium text-zinc-800 dark:text-zinc-200">Leader</span> — Home, Live
              board, Roster, Build roster, Reports, this Help page. Everything needed to run a shift
              day-to-day.
            </li>
            <li>
              <span className="font-medium text-zinc-800 dark:text-zinc-200">Admin</span> — everything a
              Leader has, plus Settings (Users, Tasks, Team members, Shift hours, Standard roster,
              Planned leave, Break rules, Branding). The configuration that shapes how the rest of the
              app behaves.
            </li>
          </ul>
        </Section>

        <Section id="daily-flow" title="A shift, start to finish">
          <p>The screens are designed to be used roughly in this order:</p>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>
              <Link href="/roster/build" className="underline">
                Build roster
              </Link>{" "}
              — before the shift starts, generate who&apos;s rostered on from each permanent/part-time
              person&apos;s Standard Roster pattern, add any casual/agency cover, mark known absences,
              then <span className="font-medium text-zinc-800 dark:text-zinc-200">Finalise</span> the
              shift to bring it onto the live board.
            </li>
            <li>
              <Link href="/board" className="underline">
                Live board
              </Link>{" "}
              — during the shift, this is what stays open: move people between tasks as work shifts
              around, extend someone&apos;s shift, and handle anyone who goes home sick or needs
              leave mid-shift.
            </li>
            <li>
              <Link href="/roster" className="underline">
                Roster
              </Link>{" "}
              — a read-only check of who&apos;s rostered on any date, useful when reviewing ahead or
              looking back.
            </li>
            <li>
              <Link href="/reports" className="underline">
                Reports
              </Link>{" "}
              — after the shift (it defaults to whichever shift just ended), pull labour hours by task
              or by team member, and export the CSV for downstream costing.
            </li>
          </ol>
        </Section>

        <Section id="live-board" title="Live board">
          <p>
            A grid of task cards for one date + shift. Each card shows who&apos;s currently on that
            task, their time on task, and the card&apos;s running total for the shift. A shift has to be{" "}
            <span className="font-medium text-zinc-800 dark:text-zinc-200">finalised</span> on Build
            roster before it shows up here at all.
          </p>
          <SubHeading>Moving people</SubHeading>
          <p>
            Tick the checkbox next to one or more people (across any number of cards), pick a
            destination task from the dropdown at the top, and click{" "}
            <span className="font-medium text-zinc-800 dark:text-zinc-200">Move selected</span>. This
            closes each person&apos;s current task and opens the new one, all at the same timestamp. The{" "}
            <span className="font-medium text-zinc-800 dark:text-zinc-200">at</span> time field defaults
            to now, but you can backdate it if you&apos;re entering a move after the fact — it can&apos;t
            be set in the future.
          </p>
          <p>
            On today&apos;s live shift only, you can also drag a person&apos;s row directly onto another
            task card instead of using the checkbox flow — same move, just one person at a time.
          </p>
          <p>
            Any task an admin hasn&apos;t hidden from the board shows up as a card once someone&apos;s on
            it — including Leave-type tasks. That&apos;s the mechanism for someone going home sick or
            taking a part-day Annual Leave mid-shift: select them and move them onto the leave task like
            any other. See{" "}
            <a href={isAdmin ? "#settings-tasks" : "#settings"} className="underline">
              Tasks
            </a>{" "}
            below for hiding a task&apos;s card without blocking moves to it.
          </p>
          <SubHeading>Extending a shift</SubHeading>
          <p>
            Select one or more people and click{" "}
            <span className="font-medium text-zinc-800 dark:text-zinc-200">Extend shift</span> to push
            their approved finish time out — optionally onto a different task, with a note. This is
            deliberately lightweight (a new finish time and a note, nothing more) — there&apos;s no
            separate overtime-approval workflow.
          </p>
          <SubHeading>Detail panels</SubHeading>
          <p>
            Click a person&apos;s name to see their whole shift&apos;s movement timeline, correct a
            wrong time, or move/extend just that one person. Click a task&apos;s heading (not the
            checkbox) to see everyone who&apos;s touched that task today, including people who&apos;ve
            since moved off it.
          </p>
        </Section>

        <Section id="roster" title="Roster (view)">
          <p>
            A read-only table of the daily roster for any date — who&apos;s rostered, on what task, what
            status (Planned / Absent), and whether they came from a Standard Roster pattern or were
            added manually. Use{" "}
            <span className="font-medium text-zinc-800 dark:text-zinc-200">Build this roster</span> to
            jump into edit mode for the date you&apos;re viewing.
          </p>
        </Section>

        <Section id="build-roster" title="Build roster">
          <p>Everything needed to prepare a date/shift before it goes live, in the order it&apos;s laid out:</p>
          <SubHeading>Generate from Standard Roster</SubHeading>
          <p>
            Pulls in every permanent/part-time employee who has a Standard Roster pattern for that day
            of the week. Safe to run more than once — already-generated rows are skipped, so re-running
            after adding a new Standard Roster pattern only adds what&apos;s missing.
          </p>
          <SubHeading>Per-row actions</SubHeading>
          <p>
            Each rostered row can have its planned start/finish or task adjusted inline, be marked
            absent (choose a leave type — this creates a real leave movement, not just a status flag,
            and can be undone before anything else touches that row), or removed from the roster
            entirely.
          </p>
          <SubHeading>Bulk actions</SubHeading>
          <p>
            Select several rows via their checkboxes to mark them all absent at once, or use{" "}
            <span className="font-medium text-zinc-800 dark:text-zinc-200">Change start/finish time</span>{" "}
            to shift a batch of start and/or finish times together — useful for an early call-on or a
            planned late finish across a group.
          </p>
          <SubHeading>Casual / agency pool</SubHeading>
          <p>
            Every active employee not already on that day&apos;s roster and with no Standard Roster
            coverage for that day — search, filter by shift, multi-select, assign a task (optionally
            custom hours instead of the shift&apos;s standard window), and add them in one action. This
            is also how an ad-hoc weekend or extra shift gets covered, since it&apos;s not restricted to
            casual/agency employment types specifically.
          </p>
          <SubHeading>Finalise roster</SubHeading>
          <p>
            Bulk-opens a task movement for everyone currently planned on that shift, bringing it onto
            the live board. The roster stays fully editable afterwards — if you add someone or generate
            more rows later,{" "}
            <span className="font-medium text-zinc-800 dark:text-zinc-200">
              re-finalise to bring the new rows live too
            </span>
            ; it only touches whoever isn&apos;t already live, so it&apos;s safe to click again.
          </p>
          <SubHeading>Print sheet</SubHeading>
          <p>
            Once a shift is finalised, a printable task-assignment sheet becomes available — grouped by
            task, names only, meant for a physical handout rather than screen use.
          </p>
        </Section>

        <Section id="reports" title="Reports">
          <p>
            Labour hours by task or by team member, for any date range/shift/employee/task/department/
            employment type/agency combination. On first visit (before you&apos;ve applied any filters)
            it defaults to whichever shift just ended, since end-of-shift reporting is the most common
            use — apply filters once and your own choices (including clearing the shift filter to see
            everything) stick from then on.
          </p>
          <p>
            <span className="font-medium text-zinc-800 dark:text-zinc-200">Gross hours</span> is a
            person&apos;s whole shift, uncapped.{" "}
            <span className="font-medium text-zinc-800 dark:text-zinc-200">Unpaid break</span> comes off
            that per the{" "}
            <Link href="/settings/break-rules" className="underline">
              Break rules
            </Link>{" "}
            configuration.{" "}
            <span className="font-medium text-zinc-800 dark:text-zinc-200">Net worked hours</span> is
            what&apos;s left — the figure downstream costing should use. Leave-type tasks are excluded
            from all three; leave time is tracked (it still gets its own row/export line), just not
            counted as worked hours.
          </p>
          <p>
            <span className="font-medium text-zinc-800 dark:text-zinc-200">Export CSV</span> gives one
            row per employee, per shift, per task — every numeric column on it is safe to sum in a
            pivot table (e.g. summing an employee&apos;s net hours across their task rows for one shift
            reproduces that shift&apos;s real total exactly, rather than repeating the whole-shift
            figure on every row).
          </p>
        </Section>

        {isAdmin ? (
          <Section id="settings" title="Settings">
            <p>
              Everything below is Admin-only — a Leader signed in won&apos;t see the Settings link at
              all. Screens listed roughly in the order you&apos;d touch them when setting the app up for
              a new team, though day to day you&apos;ll mostly revisit Team members, Tasks, and Standard
              roster.
            </p>

            <SubHeading>
              <Link href="/settings/users" className="underline">
                Users
              </Link>
            </SubHeading>
            <p>
              Who can sign in, and at what level (Leader/Admin). Deactivating someone signs them out
              everywhere immediately.
            </p>

            <SubHeading>
              <Link href="/settings/employees" className="underline">
                Team members
              </Link>
            </SubHeading>
            <p>
              Every employee this app rosters. Adding a new permanent/part-time employee — or converting
              a casual/agency/contractor one to permanent/part-time — prompts you straight into Standard
              Roster to set up their weekly pattern, since neither has one yet. Deactivating removes
              someone from the roster builder and casual pool without touching any past roster row
              they&apos;re already on.
            </p>

            <SubHeading id="settings-tasks">
              <Link href="/settings/tasks" className="underline">
                Tasks
              </Link>
            </SubHeading>
            <p>
              The direct/productive, indirect, and leave-type tasks every roster and the live board pick
              from.{" "}
              <span className="font-medium text-zinc-800 dark:text-zinc-200">Hide from board</span> keeps
              a task from ever showing a persistent card on the live board (and out of the &quot;Total
              shift hours&quot; figure) without blocking anyone being moved onto it — the way to keep,
              say, your leave types off the board visually while still being able to move someone onto
              Sick Leave mid-shift. That&apos;s different from{" "}
              <span className="font-medium text-zinc-800 dark:text-zinc-200">Retire</span>, which stops a
              task appearing as a choice anywhere at all (past rows using it stay intact either way).
            </p>

            <SubHeading>
              <Link href="/settings/shifts" className="underline">
                Shift hours
              </Link>
            </SubHeading>
            <p>
              Canonical AM/PM/Night start and finish times, plus each shift&apos;s scheduled break time
              (which controls which task&apos;s hours the unpaid break deduction actually comes out of —
              left unset, it falls back to whichever task someone spent the most time on). Editing
              doesn&apos;t retroactively change already-planned roster rows.
            </p>

            <SubHeading>
              <Link href="/settings/standard-roster" className="underline">
                Standard roster
              </Link>
            </SubHeading>
            <p>
              The recurring weekly pattern (day, shift, hours, default task) each permanent/part-time
              employee is rostered against — what Build roster&apos;s &quot;Generate&quot; reads from.
              Editing never overwrites history: a change closes the old pattern out from a chosen date
              and opens a new one, so what a pattern used to be stays reconstructable. Supports pasting a
              block from a spreadsheet for bulk updates, with a preview before anything&apos;s applied.
            </p>

            <SubHeading>
              <Link href="/settings/planned-leave" className="underline">
                Planned leave
              </Link>
            </SubHeading>
            <p>
              Known future leave, entered ahead of time — when the roster is later generated for a
              covered date, that person is pre-flagged onto the leave task instead of their usual task,
              no same-day action needed. For unplanned leave (sick, goes home mid-shift), you don&apos;t
              need anything here — that&apos;s a live-board move, or Mark Absent on Build roster for the
              whole day.
            </p>

            <SubHeading>
              <Link href="/settings/break-rules" className="underline">
                Break rules
              </Link>
            </SubHeading>
            <p>
              Unpaid meal-break deductions by hours worked (e.g. 6+ hours worked → 30 unpaid minutes) —
              the highest threshold a shift&apos;s gross hours meet is the one that applies, not a
              cumulative stack. Edit these as your enterprise agreement changes.
            </p>

            <SubHeading>
              <Link href="/settings/branding" className="underline">
                Branding
              </Link>
            </SubHeading>
            <p>
              An accent colour and a logo, shown in the side nav header and on the login page in place of
              the plain wordmark. Cosmetic only — leave both unset for the default styling.
            </p>
          </Section>
        ) : (
          <Section id="settings" title="Settings">
            <p>
              Settings is Admin-only, so it isn&apos;t shown for your account. It covers Users, Team
              members, Tasks, Shift hours, Standard roster, Planned leave, Break rules, and Branding — if
              you need something changed there, ask an admin.
            </p>
          </Section>
        )}

        <Section id="faq" title="Common questions">
          <SubHeading>Someone&apos;s going home sick, or taking a part-day leave — what do I do?</SubHeading>
          <p>
            On the live board, select them and move them onto the relevant leave task, same as any other
            move. If it&apos;s not in the &quot;Move selected to&quot; list,{" "}
            {isAdmin ? (
              <>
                check it&apos;s{" "}
                <Link href="/settings/tasks" className="underline">
                  active
                </Link>{" "}
                — hidden tasks are still selectable, only retired ones aren&apos;t.
              </>
            ) : (
              "ask an admin to check it hasn't been retired in Settings > Tasks."
            )}
          </p>

          <SubHeading>The live board says &quot;Roster not yet finalised&quot;</SubHeading>
          <p>
            Go to Build roster for that date/shift and click Finalise Roster. If people were added after
            it was already finalised once, click it again — it only brings the new rows live, it
            doesn&apos;t disturb anyone already on the board.
          </p>

          <SubHeading>A task isn&apos;t showing on the live board even though someone&apos;s on it</SubHeading>
          <p>
            {isAdmin ? (
              <>
                It&apos;s probably hidden — check{" "}
                <Link href="/settings/tasks" className="underline">
                  Tasks
                </Link>{" "}
                for a &quot;hidden from live board&quot; tag and click &quot;Show on board&quot; if you
                want its card back.
              </>
            ) : (
              "An admin has probably hidden that task's card from the board — ask them to switch it back on in Settings > Tasks if you need to see it there."
            )}
          </p>

          <SubHeading>I entered a move or time at the wrong time</SubHeading>
          <p>
            Click the person&apos;s name on the live board to open their detail panel — every movement
            for their shift is listed there and can be corrected directly, including a closed
            movement&apos;s finish time.
          </p>

          <SubHeading>What&apos;s the difference between Retire and Hide from board (Tasks)?</SubHeading>
          <p>
            Retire removes a task from every picker across the app (past rows stay intact). Hide from
            board only affects whether it gets a card on the live board — it stays fully selectable
            everywhere, including as a live-board move target.
          </p>
        </Section>
      </div>
    </div>
  );
}
