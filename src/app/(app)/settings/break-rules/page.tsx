import Link from "next/link";
import { prisma } from "@/lib/db";
import { BreakRulesGrid, type BreakRuleRow } from "@/components/BreakRulesGrid";

export const dynamic = "force-dynamic";

export default async function BreakRulesSettingsPage() {
  const rules = await prisma.breakRule.findMany({ orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }] });

  const rows: BreakRuleRow[] = rules.map((r) => ({
    id: r.id,
    description: r.description,
    minHoursWorked: r.minHoursWorked.toString(),
    unpaidMinutes: r.unpaidMinutes,
    isActive: r.isActive,
    sortOrder: r.sortOrder,
  }));

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans dark:bg-black dark:text-zinc-50">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <Link href="/settings" className="text-sm text-zinc-500 hover:underline">
            ← Settings
          </Link>
          <h1 className="text-2xl font-semibold">Break rules</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Standard unpaid meal-break deductions, by hours worked — the highest threshold a shift&apos;s
            gross hours meet is the one that applies. Free to add, edit, retire, or reorder as your
            enterprise agreement changes; nothing here is hardcoded. Where the deduction actually comes
            out (which task&apos;s reported hours) is controlled by each shift&apos;s break start time on
            the{" "}
            <Link href="/settings/shifts" className="underline">
              Shift hours
            </Link>{" "}
            screen.
          </p>
        </div>
        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <BreakRulesGrid rules={rows} disabled={false} />
        </section>
      </div>
    </div>
  );
}
