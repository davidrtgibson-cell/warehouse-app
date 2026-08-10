import Link from "next/link";
import { prisma } from "@/lib/db";
import { EmployeeManagementGrid, type EmployeeRow, type DepartmentOption } from "@/components/EmployeeManagementGrid";

export const dynamic = "force-dynamic";

export default async function EmployeesSettingsPage() {
  const [employeesRaw, departmentsRaw] = await Promise.all([
    prisma.employee.findMany({
      include: { department: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.department.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  const employees: EmployeeRow[] = employeesRaw.map((e) => ({
    id: e.id,
    employeeCode: e.employeeCode,
    firstName: e.firstName,
    lastName: e.lastName,
    employmentType: e.employmentType,
    agencyName: e.agencyName,
    departmentId: e.departmentId,
    departmentName: e.department?.name ?? null,
    defaultShift: e.defaultShift,
    isActive: e.isActive,
  }));

  const departments: DepartmentOption[] = departmentsRaw.map((d) => ({ id: d.id, name: d.name }));

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans dark:bg-black dark:text-zinc-50">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <Link href="/settings" className="text-sm text-zinc-500 hover:underline">
            ← Settings
          </Link>
          <h1 className="text-2xl font-semibold">Team members</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Every employee this app rosters — permanent/part-time (who need a{" "}
            <Link href="/settings/standard-roster" className="underline">
              Standard Roster
            </Link>{" "}
            pattern) and casual/agency/contractor (the daily casual pool, no pattern of their own).
            Deactivating someone removes them from the roster builder and casual pool; every past roster
            row they&apos;re already on stays intact. Adding a new perm/part-time team member, or moving
            someone from casual/agency/contractor to perm/part-time, prompts setting up their Standard
            Roster pattern, since they won&apos;t have one yet.
          </p>
        </div>
        <EmployeeManagementGrid employees={employees} departments={departments} />
      </div>
    </div>
  );
}
