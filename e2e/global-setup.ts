import { execSync } from "node:child_process";

// Reseeds the database once before the whole run (prisma/seed.ts is fully
// re-runnable — wipes and rebuilds every table) so tests start from the
// same known data every time, regardless of what's been done through the
// app since the last seed.
export default async function globalSetup() {
  execSync("npx prisma db seed", { stdio: "inherit" });
}
