import { test, expect } from "@playwright/test";
import { ADMIN_EMAIL, login, pastWeekdayDateStr } from "./helpers";

// Exercises the full pipeline the live board depends on: generate a daily
// roster from the Standard Roster, finalise it (opens a TaskMovement per
// person), see it appear live on /board, then move someone to a different
// task. Uses a date distinct from prisma/seed.ts's own WORK_DATE — that
// date's movements are already pre-opened by the seed itself, which would
// leave "Finalise Roster" with nothing pending to click.
test.describe("roster build, finalise, and live board", () => {
  test("generate -> finalise -> live board -> move", async ({ page }) => {
    const date = pastWeekdayDateStr();
    await login(page, ADMIN_EMAIL);

    await page.goto(`/roster/build?date=${date}&shift=AM`);

    const generateButton = page.getByRole("button", { name: /^Generate \(\d+ new\)$/ });
    await expect(generateButton).toBeVisible();
    await generateButton.click();
    await expect(page.getByRole("button", { name: "Up to date" })).toBeVisible();

    const finaliseButton = page.getByRole("button", { name: /^Finalise Roster \(\d+\)$/ });
    await expect(finaliseButton).toBeVisible();
    await finaliseButton.click();
    await expect(page.getByText(/^Finalised .* by Priya Deshmukh\.?$/)).toBeVisible();

    await page.goto(`/board?date=${date}&shift=AM`);
    await expect(page.getByText("Roster not yet finalised for this date/shift.")).toHaveCount(0);
    await expect(page.getByText("Live:")).toBeVisible();

    // Move the first person on the first task card onto a different task.
    // Backdated to a fixed 10:00 (well inside the AM shift's 06:00-14:00
    // window) rather than the "now" default, so the move can't be rejected
    // for landing before the shift's own planned start.
    const firstCard = page.locator(".grid.grid-cols-1 > div").first();
    const originTaskName = await firstCard.getByRole("button").first().innerText();
    const firstCheckbox = firstCard.getByRole("checkbox").nth(1); // 0 = "select all on <task>"
    const personLabel = await firstCheckbox.getAttribute("aria-label");
    await firstCheckbox.check();

    await page.locator('input[type="time"]').fill("10:00");

    const moveSelect = page.getByLabel("Move selected to");
    const options = await moveSelect.locator("option").allTextContents();
    const targetTaskName = options.find((name) => name !== originTaskName) ?? options[0];
    await moveSelect.selectOption({ label: targetTaskName });

    await page.getByRole("button", { name: "Move selected" }).click();
    await expect(page.getByText(/^Moved 1 of 1\.$/)).toBeVisible();
    if (personLabel) {
      await expect(firstCard.getByLabel(personLabel)).toHaveCount(0);
    }
  });
});
