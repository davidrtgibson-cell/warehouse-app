import { clampToWindow, elapsedMinutes } from "@/lib/board-time";

// Shared, pure break-deduction calculation — used by the live board
// (src/app/page.tsx AND the per-task detail modal's getTaskTimeline in
// src/lib/actions/board.ts) and reporting (src/lib/reporting.ts) so the
// number a leader sees anywhere can never disagree with what's elsewhere.
// Three questions, three functions:
//   - applicableBreakMinutes: HOW MUCH is unpaid, given how long the shift is
//   - allocateBreakDeduction: WHICH MOVEMENT(S) that time actually comes out of
//   - computeEmployeeBreakAllocation: the two above, run together for one
//     employee's shift — the thing every call site actually wants

export type BreakRuleTier = { isActive: boolean; minHoursWorked: number; unpaidMinutes: number };

// Highest-threshold rule whose minHoursWorked is met by the shift's gross
// hours — not cumulative (a rule table isn't a tax bracket): someone who
// worked 9 hours gets whatever the ≥8h tier says, not the ≥6h tier's
// amount plus the ≥8h tier's amount.
export function applicableBreakMinutes(grossMinutes: number, rules: BreakRuleTier[]): number {
  const grossHours = grossMinutes / 60;
  let best: BreakRuleTier | null = null;
  for (const rule of rules) {
    if (!rule.isActive) continue;
    if (rule.minHoursWorked > grossHours) continue;
    if (!best || rule.minHoursWorked > best.minHoursWorked) best = rule;
  }
  return best?.unpaidMinutes ?? 0;
}

export type MovementForBreakAllocation = { id: string; taskId: string; startTime: Date; effectiveFinish: Date };

// Works out which movement(s) lose the unpaid minutes for one person's
// shift — keyed by movement id (not taskId), so a person who touched the
// same task twice that shift (moved off and back on) still gets the right
// specific stint reduced rather than an ambiguous task-level number.
// Callers that only care about task-level totals (the live board's task
// cards, reporting) can sum the result by taskId; the per-task-detail modal
// needs the per-movement figure directly, since it shows individual stints.
//
// Primary path: if this shift has a scheduled break start time, the break
// window is [breakStart, breakStart + totalMinutes) — whatever movement(s)
// were active during that window lose the overlapping minutes (split
// across two if the person happened to change tasks mid-break).
//
// Fallback: any shortfall — the window not fully landing inside their
// working time (no scheduled time configured for this shift at all, they
// started after the break window, the shift ended before it, etc.) — comes
// off the task they spent the most *total* time on that shift (not just a
// single stint), applied to that task's own single biggest movement. This
// is one rule, not a special case: a shift with no scheduled break time at
// all is just the shortfall being the whole amount.
export function allocateBreakDeduction(
  movements: MovementForBreakAllocation[],
  breakStart: Date | null,
  totalMinutes: number
): Map<string, number> {
  const deductions = new Map<string, number>();
  if (totalMinutes <= 0 || movements.length === 0) return deductions;

  let covered = 0;
  if (breakStart) {
    const breakEnd = new Date(breakStart.getTime() + totalMinutes * 60_000);
    for (const m of movements) {
      const overlap = clampToWindow(m.startTime, m.effectiveFinish, breakStart, breakEnd);
      if (!overlap) continue;
      const minutes = elapsedMinutes(overlap.start, overlap.finish);
      if (minutes <= 0) continue;
      deductions.set(m.id, (deductions.get(m.id) ?? 0) + minutes);
      covered += minutes;
    }
  }

  const shortfall = Math.max(0, totalMinutes - covered);
  if (shortfall > 0) {
    const remainingByMovement = new Map<string, number>();
    const remainingByTask = new Map<string, number>();
    for (const m of movements) {
      const remaining = elapsedMinutes(m.startTime, m.effectiveFinish) - (deductions.get(m.id) ?? 0);
      remainingByMovement.set(m.id, remaining);
      remainingByTask.set(m.taskId, (remainingByTask.get(m.taskId) ?? 0) + remaining);
    }

    let biggestTaskId: string | null = null;
    let biggestTaskRemaining = -1;
    for (const [taskId, remaining] of remainingByTask) {
      if (remaining > biggestTaskRemaining) {
        biggestTaskRemaining = remaining;
        biggestTaskId = taskId;
      }
    }

    if (biggestTaskId) {
      let biggestMovementId: string | null = null;
      let biggestMovementRemaining = -1;
      for (const m of movements) {
        if (m.taskId !== biggestTaskId) continue;
        const remaining = remainingByMovement.get(m.id)!;
        if (remaining > biggestMovementRemaining) {
          biggestMovementRemaining = remaining;
          biggestMovementId = m.id;
        }
      }
      if (biggestMovementId && biggestMovementRemaining > 0) {
        const additional = Math.min(shortfall, biggestMovementRemaining);
        deductions.set(biggestMovementId, (deductions.get(biggestMovementId) ?? 0) + additional);
      }
    }
  }

  return deductions;
}

// Sums a per-movement deduction map (from allocateBreakDeduction) up to
// per-task totals — what the live board's task cards and reporting's
// shift-level rows actually display.
export function sumDeductionsByTask(
  movements: MovementForBreakAllocation[],
  perMovement: Map<string, number>
): Map<string, number> {
  const byTask = new Map<string, number>();
  for (const m of movements) {
    const minutes = perMovement.get(m.id);
    if (!minutes) continue;
    byTask.set(m.taskId, (byTask.get(m.taskId) ?? 0) + minutes);
  }
  return byTask;
}

export type EmployeeBreakAllocation = {
  grossMinutes: number;
  breakMinutes: number;
  perMovement: Map<string, number>;
};

// The one function every call site actually wants: gross hours for this
// employee's shift, how much of that is unpaid, and which movement(s) it
// comes off — run together so nobody has to remember to chain
// applicableBreakMinutes into allocateBreakDeduction correctly themselves.
export function computeEmployeeBreakAllocation(
  movements: MovementForBreakAllocation[],
  breakStart: Date | null,
  rules: BreakRuleTier[]
): EmployeeBreakAllocation {
  const grossMinutes = movements.reduce((sum, m) => sum + elapsedMinutes(m.startTime, m.effectiveFinish), 0);
  const breakMinutes = applicableBreakMinutes(grossMinutes, rules);
  const perMovement = breakMinutes > 0 ? allocateBreakDeduction(movements, breakStart, breakMinutes) : new Map<string, number>();
  return { grossMinutes, breakMinutes, perMovement };
}
