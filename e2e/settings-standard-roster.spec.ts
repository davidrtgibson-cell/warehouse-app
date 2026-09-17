import { test, expect } from "@playwright/test";
import { ADMIN_EMAIL, login } from "./helpers";

// Regression test for a real bug hit during rollout: adding a brand-new
// Standard Roster pattern silently defaulted the Task field to whatever
// task happened to sort first, instead of forcing an explicit choice like
// every other field on this form (StandardRosterGrid.tsx's EditPatternModal
// — taskId used to initialize from taskOptions[0]?.id). Saturday is safe to
// use here: prisma/seed.ts only ever seeds Mon–Fri patterns, so every
// seeded employee's Saturday cell starts out empty regardless of run order.
test.describe("settings > standard roster", () => {
  test("a brand-new pattern requires an explicit task, doesn't default to the first one", async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    await page.goto("/settings/standard-roster?q=EMP-0001");

    const addButtons = page.getByRole("button", { name: "+ Add" });
    const emptyCellsBefore = await addButtons.count();
    await addButtons.first().click();

    await expect(page.getByLabel("Task")).toHaveValue("");

    // Leaving it blank is rejected rather than silently saving task #1.
    await page.getByRole("button", { name: "Save from this date" }).click();
    await expect(page.getByText("Choose a task")).toBeVisible();

    const taskOptions = await page.getByLabel("Task").locator("option").allTextContents();
    const realTaskName = taskOptions[1]; // index 0 is the "—" placeholder
    await page.getByLabel("Task").selectOption({ label: realTaskName });
    await page.getByRole("button", { name: "Save from this date" }).click();

    // One fewer empty ("+ Add") cell for this employee than before.
    await expect(addButtons).toHaveCount(emptyCellsBefore - 1);
  });
});
