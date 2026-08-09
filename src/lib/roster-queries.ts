import type { Prisma } from "@/generated/prisma/client";
import { DayOfWeek } from "@/generated/prisma/client";

// The "is this pattern in effect as of this date" bracket — shared by the
// Standard Roster settings grid (every currently-active row, any day) and
// standardRosterEligibilityWhere below (the same bracket, narrowed to one
// day). Kept as one function so the two can't drift apart.
export function standardRosterCurrentWhere(asOfDate: Date): Prisma.StandardRosterWhereInput {
  return {
    isActive: true,
    effectiveFrom: { lte: asOfDate },
    OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOfDate } }],
    employee: { isActive: true },
  };
}

// Shared between the Build Roster page's "N to generate" preview and the
// generateDailyRosterFromStandard action's actual query, so the two can't
// drift apart.
export function standardRosterEligibilityWhere(
  dayOfWeek: DayOfWeek,
  workDate: Date
): Prisma.StandardRosterWhereInput {
  return {
    ...standardRosterCurrentWhere(workDate),
    dayOfWeek,
  };
}
