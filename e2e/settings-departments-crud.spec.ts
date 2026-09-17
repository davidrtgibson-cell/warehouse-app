import { test, expect } from "@playwright/test";
import { ADMIN_EMAIL, login } from "./helpers";

const ROW_SELECTOR = "div.flex.items-center.justify-between.gap-3.py-3";

// Departments live on the same page as Tasks (Settings > Departments &
// tasks) — deliberately, since every task needs to pick one. Scoped to the
// Departments <section> specifically since Task rows use the same row
// markup and could otherwise collide on a name match.
test.describe("settings > departments CRUD", () => {
  test("create, edit, retire, and reactivate a department", async ({ page }) => {
    const name = `E2E Test Department ${Date.now()}`;
    const editedName = `${name} (edited)`;

    await login(page, ADMIN_EMAIL);
    await page.goto("/settings/tasks");
    const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "Departments" }) });

    // Create
    await section.getByRole("button", { name: "+ Add department" }).click();
    await page.getByPlaceholder("Department name").fill(name);
    await section.getByRole("button", { name: "Save" }).click();
    const createdRow = section.locator(ROW_SELECTOR).filter({ hasText: name });
    await expect(createdRow).toBeVisible();

    // The new department shows up as a choice on both the Team member form
    // and the Task form on this same page.
    await page.goto("/settings/employees");
    await page.getByRole("button", { name: "+ Add team member" }).click();
    await expect(page.getByLabel("Department").getByRole("option", { name })).toHaveCount(1);
    await page.getByLabel("Close").click();

    await page.goto("/settings/tasks");
    const tasksSection = page.locator("section").filter({ has: page.getByRole("heading", { name: "Tasks", exact: true }) });
    await tasksSection.getByRole("button", { name: "+ Add task" }).click();
    const departmentSelect = tasksSection.locator("select").filter({ hasText: "Choose a department" });
    await expect(departmentSelect.getByRole("option", { name })).toHaveCount(1);
    await tasksSection.getByRole("button", { name: "Cancel" }).click();

    // Edit
    const section2 = page.locator("section").filter({ has: page.getByRole("heading", { name: "Departments" }) });
    const row = section2.locator(ROW_SELECTOR).filter({ hasText: name });
    await row.getByRole("button", { name: "Edit" }).click();
    await page.getByPlaceholder("Department name").fill(editedName);
    await section2.getByRole("button", { name: "Save" }).click();
    const editedRow = section2.locator(ROW_SELECTOR).filter({ hasText: editedName });
    await expect(editedRow).toBeVisible();

    // Retire — collapses into "N retired departments".
    await editedRow.getByRole("button", { name: "Retire" }).click();
    await expect(section2.locator(ROW_SELECTOR).filter({ hasText: editedName })).not.toBeVisible();
    await section2.getByText(/retired department/).click();
    const retiredRow = section2.locator(ROW_SELECTOR).filter({ hasText: editedName });
    await expect(retiredRow).toBeVisible();
    await expect(retiredRow.getByText("retired")).toBeVisible();

    // Reactivate
    await retiredRow.getByRole("button", { name: "Reactivate" }).click();
    await expect(section2.locator(ROW_SELECTOR).filter({ hasText: editedName }).getByText("retired")).toHaveCount(0);
  });
});
