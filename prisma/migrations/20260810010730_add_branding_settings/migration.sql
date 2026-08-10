-- CreateTable
CREATE TABLE "branding_settings" (
    "id" TEXT NOT NULL,
    "accentColor" TEXT,
    "logoPath" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "branding_settings_pkey" PRIMARY KEY ("id")
);
