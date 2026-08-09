-- CreateTable
CREATE TABLE "planned_leaves" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "dateFrom" DATE NOT NULL,
    "dateTo" DATE NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "planned_leaves_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "planned_leaves_employeeId_dateFrom_dateTo_idx" ON "planned_leaves"("employeeId", "dateFrom", "dateTo");

-- AddForeignKey
ALTER TABLE "planned_leaves" ADD CONSTRAINT "planned_leaves_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planned_leaves" ADD CONSTRAINT "planned_leaves_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
