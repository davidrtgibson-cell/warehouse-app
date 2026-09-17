import { test, expect } from "@playwright/test";
import { ADMIN_EMAIL, login } from "./helpers";

// Regression test for a real bug hit during rollout: adding a brand-new
// Standard Roster pattern silently defaulted the Task field to whatever
// task happened to sort first, instead of forcing an explicit choice like
// every other field on this form (StandardRosterGrid.tsx's EditPatternModal
// — taskId used to initialize from taskOptions[0]?.id). Saturday is safe to
// use here: prisma/seed.ts only ever seeds Mon–Fri patterns, so every
// seeded employee's Saturday cell starts out empty regardless of run order.
//
// Locates the Task <select> as the last <select> on the page rather than
// getByLabel("Task") — the wrapping <label> gives the select an accessible
// name that includes every option's text ("Task—GTP PickingManual…"), and
// the modal's "copy to the rest of the week" checkbox label also happens to
// contain the substring "task" ("...shift/time/task to the rest..."), so
// getByLabel("Task") intermittently matches both and fails strict mode —
// seen when this employee's seeded pattern (randomized per reseed, see
// helpers.ts) leaves a weekday open and that checkbox renders.
test.describe("settings > standard roster", () => {
  test("a brand-new pattern requires an explicit task, doesn't default to the first one", async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    await page.goto("/settings/standard-roster?q=EMP-0001");

    const addButtons = page.getByRole("button", { name: "+ Add" });
    const emptyCellsBefore = await addButtons.count();
    await addButtons.first().click();

    const taskSelect = page.locator("select").last();
    await expect(taskSelect).toHaveValue("");
    // "Save from this date" normally, but "Save for the week" if this
    // happens to be this employee's very first pattern — either way, it's
    // the only button starting with "Save".
    const saveButton = page.getByRole("button", { name: /^Save/ });

    // Leaving it blank is rejected rather than silently saving task #1.
    await saveButton.click();
    await expect(page.getByText("Choose a task")).toBeVisible();

    const taskOptions = await taskSelect.locator("option").allTextContents();
    const realTaskName = taskOptions[1]; // index 0 is the "—" placeholder
    await taskSelect.selectOption({ label: realTaskName });
    await saveButton.click();

    // One fewer empty ("+ Add") cell for this employee than before.
    await expect(addButtons).toHaveCount(emptyCellsBefore - 1);
  });
});
