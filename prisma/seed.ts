// Synthetic dev/demo data only. Nothing here represents a real employee,
// leader, agency, or roster. Employee codes are sequential (EMP-0001...) and
// leader emails use a @warehouse.test domain specifically so this data can
// never be mistaken for production records.
//
// Re-runnable: wipes and rebuilds all tables in FK-safe order every run.

import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  Shift,
  DayOfWeek,
  EmploymentType,
  UserRole,
  TaskCategory,
  RosterStatus,
  RosterSource,
  MovementStatus,
} from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Sydney was on AEST (UTC+10, standard time, no daylight saving) for the
// seeded work date in early August, so a fixed +10:00 offset is correct here.
const SYDNEY_OFFSET = "+10:00";

function sydneyDateTime(dateStr: string, hhmm: string) {
  return new Date(`${dateStr}T${hhmm}:00${SYDNEY_OFFSET}`);
}

// Calendar-date-only helper for @db.Date columns, which have no timezone.
// Deliberately anchored at UTC midnight rather than Sydney midnight — using
// the Sydney offset here would serialize to the *previous* UTC calendar
// date (Sydney is ahead of UTC), silently shifting stored dates back a day.
function dateOnly(dateStr: string) {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

function addDays(dateStr: string, days: number) {
  const d = dateOnly(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// @db.Time columns store wall-clock time with no date/timezone attached.
// Prisma represents these as JS Dates anchored to the epoch date.
function timeOnly(hh: number, mm: number) {
  return new Date(Date.UTC(1970, 0, 1, hh, mm, 0));
}

const SHIFT_TIMES: Record<Shift, { start: [number, number]; finish: [number, number]; crossesMidnight: boolean }> = {
  AM: { start: [6, 0], finish: [14, 0], crossesMidnight: false },
  PM: { start: [14, 0], finish: [22, 0], crossesMidnight: false },
  NIGHT: { start: [22, 0], finish: [6, 0], crossesMidnight: true },
};

function hhmm([h, m]: [number, number]) {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// The work date used for all sample daily-roster/movement data. A Monday
// two days after this is the anchor for "one week of standard rosters".
const WORK_DATE = "2026-08-06"; // Thursday
const ROSTER_WEEK_START = "2026-08-03"; // Monday, standard-roster effective-from

const WEEKDAYS: DayOfWeek[] = [
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
];

const FIRST_NAMES = [
  "Olivia", "Liam", "Ava", "Noah", "Isla", "Jack", "Mia", "Leo", "Zoe", "Ethan",
  "Ruby", "Lucas", "Chloe", "Mason", "Amelia", "Oscar", "Harper", "Henry", "Grace", "Charlie",
  "Ella", "Archie", "Sienna", "Thomas", "Willow", "James", "Matilda", "William", "Layla", "Cooper",
  "Priya", "Arjun", "Mei", "Wei", "Fatima", "Ahmed", "Sofia", "Diego", "Nadia", "Kofi",
  "Aroha", "Manaia", "Tavita", "Sione", "Ingrid", "Bjorn", "Yui", "Haruto", "Ines", "Rafael",
];

const LAST_NAMES = [
  "Nguyen", "Smith", "Patel", "Brown", "Wilson", "Chen", "Taylor", "Kelly", "Singh", "Walker",
  "Tran", "Anderson", "Kumar", "Robinson", "Lee", "Clarke", "Ahmed", "Campbell", "Wong", "Baker",
  "Ferreira", "Hughes", "Ibrahim", "Jansen", "Kowalski", "Larsen", "Marsh", "Ngata", "O'Brien", "Petrov",
  "Quinn", "Reyes", "Silva", "Thompson", "Ueda", "Vaughan", "Watts", "Xu", "Young", "Zhang",
];

function synthName() {
  return { firstName: pick(FIRST_NAMES), lastName: pick(LAST_NAMES) };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("Wiping existing data...");
  await prisma.exceptionLog.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.productivityVolume.deleteMany();
  await prisma.taskMovement.deleteMany();
  // Not hit until a live-board session actually finalizes a roster (this
  // table stays empty from a fresh seed onward otherwise) — a re-seed after
  // any "Finalise Roster" use needs this cleared before dailyRoster/user.
  await prisma.rosterFinalization.deleteMany();
  await prisma.dailyRoster.deleteMany();
  await prisma.standardRoster.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.task.deleteMany();
  await prisma.breakRule.deleteMany();
  await prisma.department.deleteMany();
  await prisma.shiftWindow.deleteMany();
  await prisma.user.deleteMany();

  // --- Users (leaders/admins who "process" moves, resolve exceptions, etc.) ---
  console.log("Seeding users...");
  const leaderSeeds = [
    { name: "Priya Deshmukh", role: UserRole.ADMIN },
    { name: "Callum Ferris", role: UserRole.LEADER },
    { name: "Renee Okafor", role: UserRole.LEADER },
    { name: "Marcus Webb", role: UserRole.LEADER },
    { name: "Aroha Ngata", role: UserRole.LEADER },
    { name: "Ingrid Solberg", role: UserRole.LEADER },
  ];
  const users = leaderSeeds.map((u) => ({
    id: randomUUID(),
    name: u.name,
    email: `${u.name.toLowerCase().replace(/[^a-z]+/g, ".")}@warehouse.test`,
    role: u.role,
  }));
  const systemUser = {
    id: randomUUID(),
    name: "Daily Roster Generation",
    email: "system.roster@warehouse.test",
    role: UserRole.ADMIN,
  };
  await prisma.user.createMany({ data: [...users, systemUser] });
  const leaders = users.filter((u) => u.role === UserRole.LEADER);

  // --- Departments (admin-configurable) ---
  console.log("Seeding departments...");
  const departmentNames = ["Inbound", "Outbound", "Inventory Control", "Value Added Services", "Support Services"];
  const departments = departmentNames.map((name, i) => ({ id: randomUUID(), name, sortOrder: i }));
  await prisma.department.createMany({ data: departments });

  // --- Shift windows (settings — canonical AM/PM/NIGHT hours, editable via /settings/shifts) ---
  console.log("Seeding shift windows...");
  await prisma.shiftWindow.createMany({
    data: (Object.keys(SHIFT_TIMES) as Shift[]).map((shift) => ({
      shift,
      startTime: timeOnly(...SHIFT_TIMES[shift].start),
      finishTime: timeOnly(...SHIFT_TIMES[shift].finish),
    })),
  });

  // --- Tasks (admin-configurable) ---
  console.log("Seeding tasks...");
  const taskSeeds: { name: string; category: TaskCategory }[] = [
    { name: "GTP Picking", category: TaskCategory.PRODUCTIVE },
    { name: "Manual Picking", category: TaskCategory.PRODUCTIVE },
    { name: "Indent Picking", category: TaskCategory.PRODUCTIVE },
    { name: "Packing", category: TaskCategory.PRODUCTIVE },
    { name: "Receiving", category: TaskCategory.PRODUCTIVE },
    { name: "Putaway", category: TaskCategory.PRODUCTIVE },
    { name: "VAS", category: TaskCategory.PRODUCTIVE },
    { name: "Inventory", category: TaskCategory.INDIRECT },
    { name: "Break", category: TaskCategory.INDIRECT },
    { name: "Training", category: TaskCategory.INDIRECT },
    { name: "Cleaning", category: TaskCategory.INDIRECT },
    { name: "Annual Leave", category: TaskCategory.LEAVE },
    { name: "Personal Leave", category: TaskCategory.LEAVE },
    { name: "Other Leave", category: TaskCategory.LEAVE },
    { name: "LWOP", category: TaskCategory.LEAVE },
  ];
  const tasks = taskSeeds.map((t, i) => ({ id: randomUUID(), name: t.name, category: t.category, sortOrder: i }));
  await prisma.task.createMany({ data: tasks });
  const productiveTasks = tasks.filter((t) => t.category === TaskCategory.PRODUCTIVE);
  const leaveTasks = tasks.filter((t) => t.category === TaskCategory.LEAVE);

  // --- Break rules (admin-configurable) ---
  console.log("Seeding break rules...");
  await prisma.breakRule.createMany({
    data: [
      {
        id: randomUUID(),
        description: "Under 6 hours worked — no unpaid break deduction",
        minHoursWorked: 0,
        unpaidMinutes: 0,
        sortOrder: 0,
      },
      {
        id: randomUUID(),
        description: "6 hours or more worked — 30 minute unpaid break deduction",
        minHoursWorked: 6,
        unpaidMinutes: 30,
        sortOrder: 1,
      },
    ],
  });

  // --- Employees ---
  console.log("Seeding employees...");

  // Core 150: 75 AM / 60 PM / 15 Night, independently 120 permanent / 30 part-time.
  // The brief specifies these two distributions but not their correlation, so
  // shift and employment type are assigned independently at random.
  const shiftPool = shuffle([
    ...Array(75).fill(Shift.AM),
    ...Array(60).fill(Shift.PM),
    ...Array(15).fill(Shift.NIGHT),
  ]);
  const typePool = shuffle([
    ...Array(120).fill(EmploymentType.PERMANENT),
    ...Array(30).fill(EmploymentType.PART_TIME),
  ]);

  type EmployeeRow = {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    employmentType: EmploymentType;
    agencyName: string | null;
    departmentId: string;
    defaultShift: Shift;
    isActive: boolean;
  };

  const coreEmployees: EmployeeRow[] = [];
  for (let i = 0; i < 150; i++) {
    const { firstName, lastName } = synthName();
    coreEmployees.push({
      id: randomUUID(),
      employeeCode: `EMP-${String(i + 1).padStart(4, "0")}`,
      firstName,
      lastName,
      employmentType: typePool[i],
      agencyName: null,
      departmentId: pick(departments).id,
      defaultShift: shiftPool[i],
      isActive: true,
    });
  }

  // Extra casual/agency/contractor pool — not part of the 150 required by
  // the brief's test-data spec, added so the "Casual/Agency pool" panel (any
  // active employee with no standard-roster pattern for the day) has real
  // data to show. Assumption: reasonable pool size, none get a Standard
  // Roster.
  const AGENCY_NAMES = ["Solstice Staffing", "Harbour Workforce"];
  const poolSeeds: { type: EmploymentType; count: number }[] = [
    { type: EmploymentType.CASUAL, count: 15 },
    { type: EmploymentType.AGENCY, count: 8 },
    { type: EmploymentType.CONTRACTOR, count: 4 },
  ];
  const poolEmployees: EmployeeRow[] = [];
  let poolIndex = 151;
  for (const { type, count } of poolSeeds) {
    for (let i = 0; i < count; i++) {
      const { firstName, lastName } = synthName();
      poolEmployees.push({
        id: randomUUID(),
        employeeCode: `EMP-${String(poolIndex++).padStart(4, "0")}`,
        firstName,
        lastName,
        employmentType: type,
        agencyName: type === EmploymentType.AGENCY ? pick(AGENCY_NAMES) : null,
        departmentId: pick(departments).id,
        defaultShift: pick([Shift.AM, Shift.PM, Shift.NIGHT]),
        isActive: true,
      });
    }
  }

  const allEmployees = [...coreEmployees, ...poolEmployees];
  await prisma.employee.createMany({ data: allEmployees });

  // --- Standard rosters: one week (Mon–Fri pattern) for the core 150 ---
  console.log("Seeding standard rosters...");
  const standardRosterRows: {
    id: string;
    employeeId: string;
    dayOfWeek: DayOfWeek;
    shift: Shift;
    startTime: Date;
    finishTime: Date;
    paidHours: number;
    defaultTaskId: string;
    effectiveFrom: Date;
  }[] = [];

  for (const emp of coreEmployees) {
    const days =
      emp.employmentType === EmploymentType.PERMANENT
        ? WEEKDAYS
        : shuffle(WEEKDAYS).slice(0, 3); // part-time: 3 of 5 weekdays
    const { start, finish } = SHIFT_TIMES[emp.defaultShift];
    const defaultTask = pick(productiveTasks);
    for (const day of days) {
      standardRosterRows.push({
        id: randomUUID(),
        employeeId: emp.id,
        dayOfWeek: day,
        shift: emp.defaultShift,
        startTime: timeOnly(...start),
        finishTime: timeOnly(...finish),
        paidHours: 8.0,
        defaultTaskId: defaultTask.id,
        effectiveFrom: dateOnly(ROSTER_WEEK_START),
      });
    }
  }
  await prisma.standardRoster.createMany({ data: standardRosterRows });

  // --- Daily roster for WORK_DATE, generated from standard rosters ---
  console.log("Seeding daily roster for", WORK_DATE, "...");
  const workDateDow = DayOfWeek.THURSDAY; // 2026-08-06 is a Thursday
  const todaysStandardRosters = standardRosterRows.filter((r) => r.dayOfWeek === workDateDow);

  type DailyRosterRow = {
    id: string;
    employeeId: string;
    workDate: Date;
    shift: Shift;
    plannedStart: Date;
    plannedFinish: Date;
    approvedFinish: Date;
    defaultTaskId: string;
    rosterStatus: RosterStatus;
    rosterSource: RosterSource;
    standardRosterId: string | null;
  };
  const dailyRosterRows: DailyRosterRow[] = [];

  for (const sr of todaysStandardRosters) {
    const { start, finish, crossesMidnight } = SHIFT_TIMES[sr.shift];
    const plannedStart = sydneyDateTime(WORK_DATE, hhmm(start));
    const finishDate = crossesMidnight ? addDays(WORK_DATE, 1) : WORK_DATE;
    const plannedFinish = sydneyDateTime(finishDate, hhmm(finish));
    dailyRosterRows.push({
      id: randomUUID(),
      employeeId: sr.employeeId,
      workDate: dateOnly(WORK_DATE),
      shift: sr.shift,
      plannedStart,
      plannedFinish,
      approvedFinish: plannedFinish,
      defaultTaskId: sr.defaultTaskId,
      rosterStatus: RosterStatus.PLANNED,
      rosterSource: RosterSource.STANDARD_ROSTER,
      standardRosterId: sr.id,
    });
  }

  // Mark a few employees absent (leave modelled as a task category, same
  // mechanism as Break — see brief). Undo is a UI action, not stored state.
  const absentCandidates = shuffle(dailyRosterRows.filter((r) => r.shift === Shift.AM)).slice(0, 3);
  const absentIds = new Set(absentCandidates.map((r) => r.id));
  for (const row of absentCandidates) {
    row.rosterStatus = RosterStatus.ABSENT;
  }

  // Casual/Agency pool: assign a handful into today's roster as Manual/Casual
  // additions, demonstrating the "add to daily roster" flow. Excludes anyone
  // already on the roster by construction (pool employees have no standard
  // roster rows at all).
  const manualAdditions = shuffle(poolEmployees).slice(0, 10);
  for (const emp of manualAdditions) {
    const { start, finish, crossesMidnight } = SHIFT_TIMES[emp.defaultShift];
    const plannedStart = sydneyDateTime(WORK_DATE, hhmm(start));
    const finishDate = crossesMidnight ? addDays(WORK_DATE, 1) : WORK_DATE;
    const plannedFinish = sydneyDateTime(finishDate, hhmm(finish));
    dailyRosterRows.push({
      id: randomUUID(),
      employeeId: emp.id,
      workDate: dateOnly(WORK_DATE),
      shift: emp.defaultShift,
      plannedStart,
      plannedFinish,
      approvedFinish: plannedFinish,
      defaultTaskId: pick(productiveTasks).id,
      rosterStatus: RosterStatus.PLANNED,
      rosterSource: RosterSource.MANUAL_CASUAL,
      standardRosterId: null,
    });
  }

  await prisma.dailyRoster.createMany({ data: dailyRosterRows });

  // --- Task movements ---
  console.log("Seeding task movements...");
  type MovementRow = {
    id: string;
    employeeId: string;
    dailyRosterId: string;
    taskId: string;
    startTime: Date;
    scheduledFinish: Date;
    actualFinish: Date | null;
    durationMinutes: number | null;
    status: MovementStatus;
    processedByUserId: string;
  };
  const movementRows: MovementRow[] = [];

  for (const dr of dailyRosterRows) {
    if (absentIds.has(dr.id)) {
      // Absence recorded as a leave movement spanning the shift, same
      // mechanism as any other task — not a special case.
      movementRows.push({
        id: randomUUID(),
        employeeId: dr.employeeId,
        dailyRosterId: dr.id,
        taskId: pick(leaveTasks).id,
        startTime: dr.plannedStart,
        scheduledFinish: dr.approvedFinish,
        actualFinish: null,
        durationMinutes: null,
        status: MovementStatus.ACTIVE,
        processedByUserId: systemUser.id,
      });
      continue;
    }
    movementRows.push({
      id: randomUUID(),
      employeeId: dr.employeeId,
      dailyRosterId: dr.id,
      taskId: dr.defaultTaskId,
      startTime: dr.plannedStart,
      scheduledFinish: dr.approvedFinish,
      actualFinish: null,
      durationMinutes: null,
      status: MovementStatus.ACTIVE,
      processedByUserId: systemUser.id,
    });
  }

  // Simulate a 10:15 "Move Selected" for a batch of AM employees, matching
  // the brief's worked example: close the initial movement, open a new one
  // on a different task at the same timestamp.
  const moveTime = sydneyDateTime(WORK_DATE, "10:15");
  const amMovable = movementRows.filter((m) => {
    const dr = dailyRosterRows.find((d) => d.id === m.dailyRosterId)!;
    return dr.shift === Shift.AM && !absentIds.has(dr.id);
  });
  const moved = shuffle(amMovable).slice(0, 12);
  const movingLeader = pick(leaders);
  for (const m of moved) {
    m.actualFinish = moveTime;
    m.durationMinutes = Math.round((moveTime.getTime() - m.startTime.getTime()) / 60000);
    m.status = MovementStatus.CLOSED;

    const dr = dailyRosterRows.find((d) => d.id === m.dailyRosterId)!;
    const alternativeTasks = productiveTasks.filter((t) => t.id !== m.taskId);
    movementRows.push({
      id: randomUUID(),
      employeeId: m.employeeId,
      dailyRosterId: dr.id,
      taskId: pick(alternativeTasks).id,
      startTime: moveTime,
      scheduledFinish: dr.approvedFinish,
      actualFinish: null,
      durationMinutes: null,
      status: MovementStatus.ACTIVE,
      processedByUserId: movingLeader.id,
    });
  }

  await prisma.taskMovement.createMany({ data: movementRows });

  // --- Sample productivity volumes ---
  console.log("Seeding productivity volumes...");
  const volumeRows = productiveTasks.slice(0, 5).map((t) => ({
    id: randomUUID(),
    workDate: dateOnly(WORK_DATE),
    shift: Shift.AM,
    taskId: t.id,
    units: Math.floor(200 + Math.random() * 800),
    notes: "Seed sample volume",
    recordedByUserId: pick(leaders).id,
  }));
  await prisma.productivityVolume.createMany({ data: volumeRows });

  console.log("Done.");
  console.log(`  Users: ${users.length + 1} (incl. system roster-generation account)`);
  console.log(`  Departments: ${departments.length}`);
  console.log(`  Tasks: ${tasks.length}`);
  console.log(`  Break rules: 2`);
  console.log(`  Employees: ${allEmployees.length} (${coreEmployees.length} core + ${poolEmployees.length} casual/agency/contractor pool)`);
  console.log(`  Standard roster rows: ${standardRosterRows.length}`);
  console.log(`  Daily roster rows for ${WORK_DATE}: ${dailyRosterRows.length} (${absentCandidates.length} marked absent, ${manualAdditions.length} manual/casual)`);
  console.log(`  Task movements: ${movementRows.length} (${moved.length} simulated moves at 10:15)`);
  console.log(`  Productivity volumes: ${volumeRows.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
