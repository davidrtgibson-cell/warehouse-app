import { RosterStatus, type EmploymentType } from "@/generated/prisma/client";

export function formatEmploymentType(type: EmploymentType, agencyName: string | null) {
  const label = type.replace("_", " ").toLowerCase();
  const capitalized = label.charAt(0).toUpperCase() + label.slice(1);
  return agencyName ? `${capitalized} — ${agencyName}` : capitalized;
}

export const ROSTER_STATUS_STYLES: Record<RosterStatus, string> = {
  PLANNED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  ABSENT: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  CANCELLED: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};
