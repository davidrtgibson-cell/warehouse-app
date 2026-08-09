import { describe, expect, it } from "vitest";
import {
  allocateBreakDeduction,
  applicableBreakMinutes,
  computeEmployeeBreakAllocation,
  sumDeductionsByTask,
  type BreakRuleTier,
  type MovementForBreakAllocation,
} from "./break-rules";

const RULES: BreakRuleTier[] = [
  { isActive: true, minHoursWorked: 6, unpaidMinutes: 30 },
  { isActive: true, minHoursWorked: 8, unpaidMinutes: 45 },
  // Deliberately inactive — should never be selected even though its own
  // threshold would otherwise win.
  { isActive: false, minHoursWorked: 10, unpaidMinutes: 60 },
];

function d(hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 0, 1, h, m));
}

describe("applicableBreakMinutes", () => {
  it("returns 0 below the lowest threshold", () => {
    expect(applicableBreakMinutes(5 * 60, RULES)).toBe(0);
  });

  it("picks the highest threshold met, not cumulative", () => {
    expect(applicableBreakMinutes(9 * 60, RULES)).toBe(45);
  });

  it("is exact-inclusive at a threshold boundary", () => {
    expect(applicableBreakMinutes(6 * 60, RULES)).toBe(30);
  });

  it("ignores inactive rules even when their threshold is met", () => {
    expect(applicableBreakMinutes(11 * 60, RULES)).toBe(45);
  });
});

describe("allocateBreakDeduction", () => {
  it("splits the break window across two movements that overlap it", () => {
    const movements: MovementForBreakAllocation[] = [
      { id: "m1", taskId: "t1", startTime: d("06:00"), effectiveFinish: d("11:15") },
      { id: "m2", taskId: "t2", startTime: d("11:15"), effectiveFinish: d("14:00") },
    ];
    // 30 min break starting 11:00 — 15 min falls in m1 (11:00-11:15), 15 in m2 (11:15-11:30)
    const result = allocateBreakDeduction(movements, d("11:00"), 30);
    expect(result.get("m1")).toBe(15);
    expect(result.get("m2")).toBe(15);
  });

  it("falls back to the biggest task's biggest movement when there's no scheduled break time", () => {
    const movements: MovementForBreakAllocation[] = [
      { id: "m1", taskId: "picking", startTime: d("06:00"), effectiveFinish: d("10:00") }, // 4h
      { id: "m2", taskId: "packing", startTime: d("10:00"), effectiveFinish: d("14:00") }, // 4h — tie, but picking listed first
    ];
    const result = allocateBreakDeduction(movements, null, 30);
    // Whichever task is biggest gets the deduction on its own biggest movement — here packing's
    // single movement (4h) ties picking's single movement (4h); allocateBreakDeduction resolves
    // ties by keeping the first-seen biggest, i.e. picking.
    expect(result.get("m1")).toBe(30);
    expect(result.has("m2")).toBe(false);
  });

  it("covers a shortfall not fully inside the scheduled window from the biggest remaining task", () => {
    const movements: MovementForBreakAllocation[] = [
      { id: "m1", taskId: "t1", startTime: d("06:00"), effectiveFinish: d("11:00") },
      // Shift ends before the 30-minute break window (11:00-11:30) can fully land
      { id: "m2", taskId: "t2", startTime: d("11:00"), effectiveFinish: d("11:10") },
    ];
    const result = allocateBreakDeduction(movements, d("11:00"), 30);
    // 10 min covered by m2 inside the window; 20 min shortfall goes to the biggest
    // remaining task (t1, with 5h remaining vs t2's now-0 remaining).
    expect(result.get("m2")).toBe(10);
    expect(result.get("m1")).toBe(20);
  });

  it("returns an empty map for zero or negative total minutes", () => {
    const movements: MovementForBreakAllocation[] = [
      { id: "m1", taskId: "t1", startTime: d("06:00"), effectiveFinish: d("14:00") },
    ];
    expect(allocateBreakDeduction(movements, d("11:00"), 0).size).toBe(0);
  });
});

describe("sumDeductionsByTask", () => {
  it("sums per-movement minutes up to per-task totals", () => {
    const movements: MovementForBreakAllocation[] = [
      { id: "m1", taskId: "picking", startTime: d("06:00"), effectiveFinish: d("10:00") },
      { id: "m2", taskId: "picking", startTime: d("12:00"), effectiveFinish: d("14:00") },
      { id: "m3", taskId: "packing", startTime: d("10:00"), effectiveFinish: d("12:00") },
    ];
    const perMovement = new Map([
      ["m1", 10],
      ["m2", 5],
      ["m3", 15],
    ]);
    const byTask = sumDeductionsByTask(movements, perMovement);
    expect(byTask.get("picking")).toBe(15);
    expect(byTask.get("packing")).toBe(15);
  });
});

describe("computeEmployeeBreakAllocation", () => {
  it("runs gross-hours and deduction together for a full shift", () => {
    const movements: MovementForBreakAllocation[] = [
      { id: "m1", taskId: "t1", startTime: d("06:00"), effectiveFinish: d("14:00") }, // 8h gross
    ];
    const result = computeEmployeeBreakAllocation(movements, d("11:00"), RULES);
    expect(result.grossMinutes).toBe(8 * 60);
    expect(result.breakMinutes).toBe(45); // 8h meets the higher tier
    expect(result.perMovement.get("m1")).toBe(45);
  });

  it("charges no break at all under the lowest threshold", () => {
    const movements: MovementForBreakAllocation[] = [
      { id: "m1", taskId: "t1", startTime: d("06:00"), effectiveFinish: d("11:00") }, // 5h gross
    ];
    const result = computeEmployeeBreakAllocation(movements, d("10:00"), RULES);
    expect(result.grossMinutes).toBe(5 * 60);
    expect(result.breakMinutes).toBe(0);
    expect(result.perMovement.size).toBe(0);
  });
});
