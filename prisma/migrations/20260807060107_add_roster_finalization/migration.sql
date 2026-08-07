-- CreateTable
CREATE TABLE "roster_finalizations" (
    "id" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "shift" "Shift" NOT NULL,
    "finalizedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizedByUserId" TEXT NOT NULL,

    CONSTRAINT "roster_finalizations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roster_finalizations_workDate_shift_key" ON "roster_finalizations"("workDate", "shift");

-- AddForeignKey
ALTER TABLE "roster_finalizations" ADD CONSTRAINT "roster_finalizations_finalizedByUserId_fkey" FOREIGN KEY ("finalizedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
