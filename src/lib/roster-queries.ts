import type { Prisma } from "@/generated/prisma/client";
import { DayOfWeek } from "@/generated/prisma/client";

// Shared between the Build Roster page's "N to generate" preview and the
// generateDailyRosterFromStandard action's actual query, so the two can't
// drift apart.
export function standardRosterEligibilityWhere(
  dayOfWeek: DayOfWeek,
  workDate: Date
): Prisma.StandardRosterWhereInput {
  return {
    dayOfWeek,
    isActive: true,
    effectiveFrom: { lte: workDate },
    OR: [{ effectiveTo: null }, { effectiveTo: { gte: workDate } }],
    employee: { isActive: true },
  };
}
