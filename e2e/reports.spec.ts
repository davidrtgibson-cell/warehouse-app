import { test, expect } from "@playwright/test";
import { ADMIN_EMAIL, login } from "./helpers";

// prisma/seed.ts's fixed WORK_DATE — the one day guaranteed to have real
// TaskMovement rows regardless of when this suite runs (see helpers.ts's
// own comment on why pastWeekdayDateStr() deliberately avoids this date).
const SEED_WORK_DATE = "2026-08-06";

test.describe("reports", () => {
  test("by department groups hours by the task's department, not the employee's", async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    await page.goto(`/reports?from=${SEED_WORK_DATE}&to=${SEED_WORK_DATE}&view=department`);

    // Every seeded task has a department (prisma/seed.ts), so the rollup
    // should show real department names, never the "No department"
    // fallback (see summarizeByDepartment in src/lib/reporting.ts).
    const table = page.locator("table").filter({ has: page.getByRole("columnheader", { name: "Department" }) });
    await expect(table).toBeVisible();
    await expect(table.getByRole("cell", { name: "No department" })).toHaveCount(0);
    await expect(table.getByRole("row", { name: /Support Services/ })).toBeVisible();

    // CSV export carries both department columns distinctly.
    const csvResponse = await page.request.get(
      `/reports/export?from=${SEED_WORK_DATE}&to=${SEED_WORK_DATE}`
    );
    const csv = await csvResponse.text();
    const header = csv.split("\r\n")[0];
    expect(header).toContain("Task department");
    expect(header).toContain("Employee department");
  });
});
