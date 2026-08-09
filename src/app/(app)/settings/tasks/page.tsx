import Link from "next/link";
import { prisma } from "@/lib/db";
import { TaskManagementGrid, type TaskRow } from "@/components/TaskManagementGrid";

export const dynamic = "force-dynamic";

export default async function TasksSettingsPage() {
  const tasks = await prisma.task.findMany({ orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }] });

  const rows: TaskRow[] = tasks.map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category,
    isPaid: t.isPaid,
    isActive: t.isActive,
    sortOrder: t.sortOrder,
  }));

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans dark:bg-black dark:text-zinc-50">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <Link href="/settings" className="text-sm text-zinc-500 hover:underline">
            ← Settings
          </Link>
          <h1 className="text-2xl font-semibold">Tasks</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            The list every roster and the live board pick from — direct/productive work, indirect
            (breaks, training, inventory), and leave types. &quot;Paid&quot; only matters for Leave
            tasks: it feeds the paid/unpaid split in reporting, and doesn&apos;t affect break-rule
            eligibility — Leave tasks are always excluded from gross hours worked, paid or not. Retiring
            a task keeps every past roster/movement row that already used it intact; it just stops
            appearing as a choice for new ones.
          </p>
        </div>
        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <TaskManagementGrid tasks={rows} disabled={false} />
        </section>
      </div>
    </div>
  );
}
