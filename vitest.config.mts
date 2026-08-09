import "dotenv/config";
import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit tests for src/lib/* pure functions (BACKLOG.md Tier 5 — test
// framework). `dotenv/config` above matters even though the tested
// functions themselves don't touch the DB: several lib modules
// (schedule.ts, roster-queries.ts, ...) import src/lib/db.ts at the top of
// the file for their few DB-touching exports, so importing the module at
// all constructs a PrismaClient — which needs DATABASE_URL to exist (not
// necessarily a live connection; nothing here actually queries).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
