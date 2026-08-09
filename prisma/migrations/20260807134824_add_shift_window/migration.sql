-- CreateTable
CREATE TABLE "shift_windows" (
    "id" TEXT NOT NULL,
    "shift" "Shift" NOT NULL,
    "startTime" TIME NOT NULL,
    "finishTime" TIME NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "shift_windows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shift_windows_shift_key" ON "shift_windows"("shift");
