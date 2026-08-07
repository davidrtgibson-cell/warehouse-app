-- CreateEnum
CREATE TYPE "Shift" AS ENUM ('AM', 'PM', 'NIGHT');

-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('PERMANENT', 'PART_TIME', 'CASUAL', 'AGENCY', 'CONTRACTOR');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('LEADER', 'ADMIN');

-- CreateEnum
CREATE TYPE "TaskCategory" AS ENUM ('PRODUCTIVE', 'INDIRECT', 'LEAVE');

-- CreateEnum
CREATE TYPE "RosterStatus" AS ENUM ('PLANNED', 'ABSENT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RosterSource" AS ENUM ('STANDARD_ROSTER', 'MANUAL_CASUAL');

-- CreateEnum
CREATE TYPE "MovementStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "ExceptionType" AS ENUM ('MISSING_ACTIVE_TASK', 'DUPLICATE_ACTIVE_TASK', 'OVERLAPPING_MOVEMENT', 'MOVEMENT_GAP', 'TASK_TIME_OUTSIDE_SHIFT', 'CORRECTION');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'LEADER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "employmentType" "EmploymentType" NOT NULL,
    "agencyName" TEXT,
    "departmentId" TEXT,
    "defaultShift" "Shift",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "TaskCategory" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "standard_rosters" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "dayOfWeek" "DayOfWeek" NOT NULL,
    "shift" "Shift" NOT NULL,
    "startTime" TIME NOT NULL,
    "finishTime" TIME NOT NULL,
    "paidHours" DECIMAL(5,2) NOT NULL,
    "defaultTaskId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "standard_rosters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_rosters" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "shift" "Shift" NOT NULL,
    "plannedStart" TIMESTAMPTZ NOT NULL,
    "plannedFinish" TIMESTAMPTZ NOT NULL,
    "approvedFinish" TIMESTAMPTZ NOT NULL,
    "defaultTaskId" TEXT NOT NULL,
    "rosterStatus" "RosterStatus" NOT NULL DEFAULT 'PLANNED',
    "rosterSource" "RosterSource" NOT NULL,
    "standardRosterId" TEXT,
    "overrideReason" TEXT,
    "shiftExtended" BOOLEAN NOT NULL DEFAULT false,
    "extensionNote" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "daily_rosters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_movements" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "dailyRosterId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "startTime" TIMESTAMPTZ NOT NULL,
    "scheduledFinish" TIMESTAMPTZ NOT NULL,
    "actualFinish" TIMESTAMPTZ,
    "durationMinutes" INTEGER,
    "status" "MovementStatus" NOT NULL DEFAULT 'ACTIVE',
    "processedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "task_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "break_rules" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "minHoursWorked" DECIMAL(5,2) NOT NULL,
    "unpaidMinutes" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "break_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productivity_volumes" (
    "id" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "shift" "Shift" NOT NULL,
    "taskId" TEXT NOT NULL,
    "units" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "productivity_volumes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exception_logs" (
    "id" TEXT NOT NULL,
    "type" "ExceptionType" NOT NULL,
    "employeeId" TEXT,
    "dailyRosterId" TEXT,
    "taskMovementId" TEXT,
    "description" TEXT NOT NULL,
    "detectedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ,
    "resolvedByUserId" TEXT,

    CONSTRAINT "exception_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "changes" JSONB,
    "changedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateIndex
CREATE UNIQUE INDEX "employees_employeeCode_key" ON "employees"("employeeCode");

-- CreateIndex
CREATE INDEX "employees_isActive_defaultShift_idx" ON "employees"("isActive", "defaultShift");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_name_key" ON "tasks"("name");

-- CreateIndex
CREATE INDEX "standard_rosters_employeeId_dayOfWeek_shift_isActive_idx" ON "standard_rosters"("employeeId", "dayOfWeek", "shift", "isActive");

-- CreateIndex
CREATE INDEX "daily_rosters_workDate_shift_rosterStatus_idx" ON "daily_rosters"("workDate", "shift", "rosterStatus");

-- CreateIndex
CREATE UNIQUE INDEX "daily_rosters_employeeId_workDate_shift_key" ON "daily_rosters"("employeeId", "workDate", "shift");

-- CreateIndex
CREATE INDEX "task_movements_employeeId_status_idx" ON "task_movements"("employeeId", "status");

-- CreateIndex
CREATE INDEX "task_movements_dailyRosterId_status_idx" ON "task_movements"("dailyRosterId", "status");

-- CreateIndex
CREATE INDEX "productivity_volumes_workDate_shift_taskId_idx" ON "productivity_volumes"("workDate", "shift", "taskId");

-- CreateIndex
CREATE INDEX "exception_logs_type_resolvedAt_idx" ON "exception_logs"("type", "resolvedAt");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standard_rosters" ADD CONSTRAINT "standard_rosters_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standard_rosters" ADD CONSTRAINT "standard_rosters_defaultTaskId_fkey" FOREIGN KEY ("defaultTaskId") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_rosters" ADD CONSTRAINT "daily_rosters_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_rosters" ADD CONSTRAINT "daily_rosters_defaultTaskId_fkey" FOREIGN KEY ("defaultTaskId") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_rosters" ADD CONSTRAINT "daily_rosters_standardRosterId_fkey" FOREIGN KEY ("standardRosterId") REFERENCES "standard_rosters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_movements" ADD CONSTRAINT "task_movements_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_movements" ADD CONSTRAINT "task_movements_dailyRosterId_fkey" FOREIGN KEY ("dailyRosterId") REFERENCES "daily_rosters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_movements" ADD CONSTRAINT "task_movements_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_movements" ADD CONSTRAINT "task_movements_processedByUserId_fkey" FOREIGN KEY ("processedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productivity_volumes" ADD CONSTRAINT "productivity_volumes_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productivity_volumes" ADD CONSTRAINT "productivity_volumes_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exception_logs" ADD CONSTRAINT "exception_logs_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exception_logs" ADD CONSTRAINT "exception_logs_dailyRosterId_fkey" FOREIGN KEY ("dailyRosterId") REFERENCES "daily_rosters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exception_logs" ADD CONSTRAINT "exception_logs_taskMovementId_fkey" FOREIGN KEY ("taskMovementId") REFERENCES "task_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exception_logs" ADD CONSTRAINT "exception_logs_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
