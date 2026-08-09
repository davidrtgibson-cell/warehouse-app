import { EmploymentType } from "@/generated/prisma/enums";

const TEMP_TYPES = new Set<EmploymentType>([EmploymentType.CASUAL, EmploymentType.AGENCY, EmploymentType.CONTRACTOR]);
const PERM_TYPES = new Set<EmploymentType>([EmploymentType.PERMANENT, EmploymentType.PART_TIME]);

// Was a temp/casual (no Standard Roster pattern of their own) and is now
// perm/part-time — the concrete signal for the "prompt building a Standard
// Roster pattern" flow (BACKLOG.md's own framing: "a casual has none").
// Plain pure helper, not in lib/actions/employees.ts, because a "use
// server" file's exports must all be async server actions — this needs to
// run client-side too (EmployeeManagementGrid uses it to decide whether to
// show the conversion prompt).
export function isTempToPermConversion(from: EmploymentType, to: EmploymentType): boolean {
  return TEMP_TYPES.has(from) && PERM_TYPES.has(to);
}
