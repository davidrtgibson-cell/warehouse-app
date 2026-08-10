import { defineConfig, devices } from "@playwright/test";

// End-to-end tests (BACKLOG.md Tier 5 #3). Runs against `next dev` on a
// disposable copy of dev data: globalSetup below reseeds the database
// (prisma/seed.ts) before the run so tests start from a known state.
//
// fullyParallel/workers are both off — every test shares one seeded
// Postgres database (no per-test isolation), so tests that mutate roster/
// task-movement state would interfere with each other if run concurrently.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
