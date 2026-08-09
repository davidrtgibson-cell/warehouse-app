import Link from "next/link";

export const dynamic = "force-dynamic";

// Structured so future settings sections (Departments — already
// schema-ready per the isActive/sortOrder convention, but with no UI yet)
// can be added as more links here without a URL restructure.
const SETTINGS_SECTIONS = [
  {
    href: "/settings/users",
    label: "Users",
    description: "Who can sign in, their role (leader vs. admin), and password resets.",
  },
  {
    href: "/settings/employees",
    label: "Team members",
    description: "Add/deactivate employees, employment type, department, and default shift.",
  },
  {
    href: "/settings/tasks",
    label: "Tasks",
    description: "Direct/indirect work and leave types every roster and the live board pick from.",
  },
  {
    href: "/settings/shifts",
    label: "Shift hours",
    description: "AM/PM/NIGHT start & finish times, and each shift's scheduled break time.",
  },
  {
    href: "/settings/standard-roster",
    label: "Standard roster",
    description: "The recurring weekly work pattern each employee is rostered against.",
  },
  {
    href: "/settings/break-rules",
    label: "Break rules",
    description: "Unpaid meal-break deductions by hours worked — editable per your EA/business rules.",
  },
];

export default function SettingsIndexPage() {
  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans dark:bg-black dark:text-zinc-50">
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <ul className="space-y-2">
          {SETTINGS_SECTIONS.map((s) => (
            <li
              key={s.href}
              className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <Link href={s.href} className="font-medium hover:underline">
                {s.label}
              </Link>
              <p className="mt-1 text-sm text-zinc-500">{s.description}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
