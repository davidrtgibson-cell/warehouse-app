import Link from "next/link";
import { prisma } from "@/lib/db";
import { addDaysToDateString } from "@/lib/format";
import {
  currentShiftAndDateFor,
  getShiftWindows,
  previousShiftAndDate,
  sydneyNowMinutesOfDay,
  todaySydneyDateString,
} from "@/lib/schedule";
import { formatDuration } from "@/lib/board-time";
import { buildLaborReportRows, summarizeByDepartment, summarizeByPerson, summarizeByTask } from "@/lib/reporting";
import { EmploymentType, Shift, TaskCategory } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

const PREVIEW_ROW_CAP = 200;

function categoryLabel(category: TaskCategory) {
  if (category === TaskCategory.PRODUCTIVE) return "Direct";
  if (category === TaskCategory.INDIRECT) return "Indirect";
  return "Leave";
}

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

export default async function ReportsPage(props: PageProps<"/reports">) {
  const sp = await props.searchParams;

  const today = todaySydneyDateString();

  // First-ever visit (no filters submitted yet, detected via `from`'s
  // absence — every "Apply filters" GET always carries a real date there,
  // even when every other field is left at "All") defaults to the shift
  // that just ended, not a 7-day/all-shifts window — most real use of this
  // page is end-of-shift reporting (BACKLOG.md Tier 5 #4). Once the form's
  // been submitted at all, an explicitly-cleared "All shifts" is respected
  // rather than re-defaulted back to a specific one.
  const isFirstVisit = typeof sp.from !== "string";
  let defaultFrom = addDaysToDateString(today, -6);
  let defaultTo = today;
  let defaultShift: Shift | undefined;
  if (isFirstVisit) {
    const shiftWindows = await getShiftWindows();
    const { shift: liveShift, dateStr: liveDateStr } = currentShiftAndDateFor(
      shiftWindows,
      today,
      sydneyNowMinutesOfDay()
    );
    const { shift: prevShift, dateStr: prevDateStr } = previousShiftAndDate(liveDateStr, liveShift);
    defaultFrom = prevDateStr;
    defaultTo = prevDateStr;
    defaultShift = prevShift;
  }

  const from = str(sp.from) ?? defaultFrom;
  const to = str(sp.to) ?? defaultTo;
  const shift = (str(sp.shift) as Shift | undefined) ?? defaultShift;
  const employeeId = str(sp.employeeId);
  const taskId = str(sp.taskId);
  const departmentId = str(sp.departmentId);
  const taskDepartmentId = str(sp.taskDepartmentId);
  const employmentType = str(sp.employmentType) as EmploymentType | undefined;
  const agencyName = str(sp.agencyName);
  const view = str(sp.view) === "person" ? "person" : str(sp.view) === "department" ? "department" : "task";

  const [rows, employees, tasks, departments, agencies] = await Promise.all([
    buildLaborReportRows({ from, to, shift, employeeId, taskId, departmentId, taskDepartmentId, employmentType, agencyName }),
    prisma.employee.findMany({ orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
    prisma.task.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.department.findMany({ orderBy: { name: "asc" } }),
    prisma.employee.findMany({
      where: { agencyName: { not: null } },
      select: { agencyName: true },
      distinct: ["agencyName"],
      orderBy: { agencyName: "asc" },
    }),
  ]);

  // Shift-level totals need de-duplication (gross/break/net repeat on every
  // task row for that shift) — summarizeByPerson already does this, so
  // reuse it rather than re-deriving the same dedupe logic here.
  const perPerson = summarizeByPerson(rows);
  const totals = perPerson.reduce(
    (acc, p) => ({
      gross: acc.gross + p.grossMinutes,
      breakMin: acc.breakMin + p.breakMinutes,
      net: acc.net + p.netMinutes,
    }),
    { gross: 0, breakMin: 0, net: 0 }
  );

  const byTaskSummary = summarizeByTask(rows).slice(0, PREVIEW_ROW_CAP);
  const byPersonSummary = perPerson.slice(0, PREVIEW_ROW_CAP);
  const byDepartmentSummary = summarizeByDepartment(rows).slice(0, PREVIEW_ROW_CAP);

  const exportParams = new URLSearchParams();
  exportParams.set("from", from);
  exportParams.set("to", to);
  if (shift) exportParams.set("shift", shift);
  if (employeeId) exportParams.set("employeeId", employeeId);
  if (taskId) exportParams.set("taskId", taskId);
  if (departmentId) exportParams.set("departmentId", departmentId);
  if (taskDepartmentId) exportParams.set("taskDepartmentId", taskDepartmentId);
  if (employmentType) exportParams.set("employmentType", employmentType);
  if (agencyName) exportParams.set("agencyName", agencyName);

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans dark:bg-black dark:text-zinc-50">
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Labour hours by task and by team member — net worked hours already have any unpaid break
            deduction applied, per{" "}
            <Link href="/settings/break-rules" className="underline">
              Break rules
            </Link>
            .
          </p>
        </header>

        <form
          method="GET"
          className="grid grid-cols-2 gap-3 rounded-lg border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950 sm:grid-cols-4"
        >
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">From</span>
            <input
              type="date"
              name="from"
              defaultValue={from}
              className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">To</span>
            <input
              type="date"
              name="to"
              defaultValue={to}
              className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">Shift</span>
            <select
              name="shift"
              defaultValue={shift ?? ""}
              className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="">All shifts</option>
              <option value={Shift.AM}>AM</option>
              <option value={Shift.PM}>PM</option>
              <option value={Shift.NIGHT}>Night</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">View</span>
            <select
              name="view"
              defaultValue={view}
              className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="task">By task</option>
              <option value="department">By department</option>
              <option value="person">By team member</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">Employee</span>
            <select
              name="employeeId"
              defaultValue={employeeId ?? ""}
              className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="">All employees</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName} ({e.employeeCode})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">Task</span>
            <select
              name="taskId"
              defaultValue={taskId ?? ""}
              className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="">All tasks</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500" title="What department the task itself belongs to — not who's doing it">
              Task&apos;s department
            </span>
            <select
              name="taskDepartmentId"
              defaultValue={taskDepartmentId ?? ""}
              className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500" title="The employee's own nominal department, regardless of what task they worked">
              Team member&apos;s department
            </span>
            <select
              name="departmentId"
              defaultValue={departmentId ?? ""}
              className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">Employment type</span>
            <select
              name="employmentType"
              defaultValue={employmentType ?? ""}
              className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="">All types</option>
              {Object.values(EmploymentType).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          {agencies.length > 0 && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-500">Agency</span>
              <select
                name="agencyName"
                defaultValue={agencyName ?? ""}
                className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">All agencies</option>
                {agencies.map((a) => (
                  <option key={a.agencyName} value={a.agencyName ?? ""}>
                    {a.agencyName}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="col-span-full flex items-center gap-2">
            <button
              type="submit"
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Apply filters
            </button>
            <Link
              href={`/reports/export?${exportParams.toString()}`}
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Export CSV →
            </Link>
          </div>
        </form>

        <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="People" value={perPerson.length} />
          <Stat label="Gross hours" value={formatDuration(totals.gross)} />
          <Stat label="Unpaid break" value={formatDuration(totals.breakMin)} />
          <Stat label="Net worked hours" value={formatDuration(totals.net)} />
        </section>

        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
            No movements match these filters.
          </div>
        ) : view === "task" ? (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase text-zinc-500 dark:bg-zinc-900">
                <tr>
                  <th className="px-3 py-2">Task</th>
                  <th className="px-3 py-2">Department</th>
                  <th className="px-3 py-2">Direct/Indirect</th>
                  <th className="px-3 py-2">Paid</th>
                  <th className="px-3 py-2">People</th>
                  <th className="px-3 py-2">Net task hours</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
                {byTaskSummary.map((t) => (
                  <tr key={t.taskName}>
                    <td className="px-3 py-2 font-medium">{t.taskName}</td>
                    <td className="px-3 py-2 text-zinc-500">{t.taskDepartmentName ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-500">{categoryLabel(t.category)}</td>
                    <td className="px-3 py-2 text-zinc-500">
                      {t.category === TaskCategory.LEAVE ? (t.isPaid ? "Yes" : "No") : "—"}
                    </td>
                    <td className="px-3 py-2">{t.peopleCount}</td>
                    <td className="px-3 py-2 font-mono">{formatDuration(t.netMinutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : view === "department" ? (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase text-zinc-500 dark:bg-zinc-900">
                <tr>
                  <th className="px-3 py-2">Department</th>
                  <th className="px-3 py-2">Tasks</th>
                  <th className="px-3 py-2">People</th>
                  <th className="px-3 py-2">Net hours</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
                {byDepartmentSummary.map((d) => (
                  <tr key={d.departmentName}>
                    <td className="px-3 py-2 font-medium">{d.departmentName}</td>
                    <td className="px-3 py-2">{d.taskCount}</td>
                    <td className="px-3 py-2">{d.peopleCount}</td>
                    <td className="px-3 py-2 font-mono">{formatDuration(d.netMinutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase text-zinc-500 dark:bg-zinc-900">
                <tr>
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2">Gross hours</th>
                  <th className="px-3 py-2">Unpaid break</th>
                  <th className="px-3 py-2">Net worked hours</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
                {byPersonSummary.map((p) => (
                  <tr key={p.employeeCode}>
                    <td className="px-3 py-2 font-medium">
                      {p.employeeName} <span className="font-mono text-xs text-zinc-500">{p.employeeCode}</span>
                    </td>
                    <td className="px-3 py-2 font-mono">{formatDuration(p.grossMinutes)}</td>
                    <td className="px-3 py-2 font-mono">{formatDuration(p.breakMinutes)}</td>
                    <td className="px-3 py-2 font-mono">{formatDuration(p.netMinutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(view === "task" ? byTaskSummary.length : view === "department" ? byDepartmentSummary.length : byPersonSummary.length) >=
          PREVIEW_ROW_CAP && (
          <p className="text-xs text-zinc-500">
            Showing the first {PREVIEW_ROW_CAP} rows — export the CSV for the full set.
          </p>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-zinc-500">{label}</div>
    </div>
  );
}
