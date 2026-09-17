import Link from "next/link";
import { prisma } from "@/lib/db";
import { TaskManagementGrid, type TaskRow } from "@/components/TaskManagementGrid";
import { DepartmentManagementGrid, type DepartmentRow } from "@/components/DepartmentManagementGrid";

export const dynamic = "force-dynamic";

// Departments and Tasks live on one page, deliberately, in that order —
// you set up the departments first, then every task you add picks one of
// them (see Task.departmentId's doc comment in schema.prisma for why a
// task's department is a different thing from an employee's home
// department). Splitting these across two settings screens made the
// dependency between them easy to miss when this only had Tasks.
export default async function TasksSettingsPage() {
  const [tasks, departments] = await Promise.all([
    prisma.task.findMany({ include: { department: true }, orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }] }),
    prisma.department.findMany({ orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }] }),
  ]);

  const taskRows: TaskRow[] = tasks.map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category,
    isPaid: t.isPaid,
    isActive: t.isActive,
    isVisible: t.isVisible,
    sortOrder: t.sortOrder,
    departmentId: t.departmentId,
    departmentName: t.department?.name ?? null,
  }));

  const departmentRows: DepartmentRow[] = departments.map((d) => ({
    id: d.id,
    name: d.name,
    isActive: d.isActive,
    sortOrder: d.sortOrder,
  }));

  const activeDepartmentOptions = departments.filter((d) => d.isActive).map((d) => ({ id: d.id, name: d.name }));

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans dark:bg-black dark:text-zinc-50">
      <div className="mx-auto max-w-2xl space-y-8">
        <div>
          <Link href="/settings" className="text-sm text-zinc-500 hover:underline">
            ← Settings
          </Link>
          <h1 className="text-2xl font-semibold">Departments &amp; tasks</h1>
        </div>

        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-base font-semibold">Departments</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Which department a task&apos;s hours count toward for reporting — e.g. Unloader/Flat
            Receiving/GOH Receiving under Inbound, GTP Picking/GOH Picking under Order Fulfilment. This
            is separate from a{" "}
            <Link href="/settings/employees" className="underline">
              team member&apos;s own home department
            </Link>{" "}
            — someone&apos;s hours roll up under whichever department the task they were actually doing
            belongs to, not their nominal one. Retiring a department keeps every task/employee already
            assigned to it intact; it just stops appearing as a choice for new ones.
          </p>
          <div className="mt-4">
            <DepartmentManagementGrid departments={departmentRows} disabled={false} />
          </div>
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-base font-semibold">Tasks</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            The list every roster and the live board pick from — direct/productive work, indirect
            (breaks, training, inventory), and leave types. Every task belongs to one of the departments
            above. &quot;Paid&quot; only matters for Leave tasks: it feeds the paid/unpaid split in
            reporting, and doesn&apos;t affect break-rule eligibility — Leave tasks are always excluded
            from gross hours worked, paid or not. Retiring a task keeps every past roster/movement row
            that already used it intact; it just stops appearing as a choice for new ones. &quot;Hide
            from board&quot; is separate from retiring — a hidden task stays fully usable (still
            selectable when moving someone mid-shift, e.g. onto Sick Leave, or a part-day Annual Leave),
            it just doesn&apos;t get its own persistent card on the live board, and its time doesn&apos;t
            count toward the board&apos;s &quot;Total shift hours&quot; figure.
          </p>
          <div className="mt-4">
            <TaskManagementGrid tasks={taskRows} departments={activeDepartmentOptions} disabled={false} />
          </div>
        </section>
      </div>
    </div>
  );
}
