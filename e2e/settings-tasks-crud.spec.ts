import { test, expect } from "@playwright/test";
import { ADMIN_EMAIL, login } from "./helpers";

const ROW_SELECTOR = "div.flex.items-center.justify-between.gap-3.py-3";

test.describe("settings > tasks CRUD", () => {
  test("create, edit, retire, and reactivate a task", async ({ page }) => {
    const name = `E2E Test Task ${Date.now()}`;
    const editedName = `${name} (edited)`;

    await login(page, ADMIN_EMAIL);
    await page.goto("/settings/tasks");

    // Create — department is required (see Task.departmentId's doc comment
    // in schema.prisma); pick whatever the seed's first department is.
    await page.getByRole("button", { name: "+ Add task" }).click();
    await page.getByPlaceholder("Task name").fill(name);
    const departmentSelect = page.locator("select").filter({ hasText: "Choose a department" });
    await departmentSelect.selectOption({ index: 1 });
    await page.getByRole("button", { name: "Save" }).click();
    const createdRow = page.locator(ROW_SELECTOR).filter({ hasText: name });
    await expect(createdRow).toBeVisible();

    // Edit
    await createdRow.getByRole("button", { name: "Edit" }).click();
    await page.getByPlaceholder("Task name").fill(editedName);
    await page.getByRole("button", { name: "Save" }).click();
    const editedRow = page.locator(ROW_SELECTOR).filter({ hasText: editedName });
    await expect(editedRow).toBeVisible();

    // Retire — moves into the collapsed "N retired tasks" <details>, so it's
    // still in the DOM (hence not toHaveCount(0)) but not visible until expanded.
    await editedRow.getByRole("button", { name: "Retire" }).click();
    await expect(page.locator(ROW_SELECTOR).filter({ hasText: editedName })).not.toBeVisible();
    await page.getByText(/retired task/).click(); // expand the <details> section
    const retiredRow = page.locator(ROW_SELECTOR).filter({ hasText: editedName });
    await expect(retiredRow).toBeVisible();
    await expect(retiredRow.getByText("retired")).toBeVisible();

    // Reactivate
    await retiredRow.getByRole("button", { name: "Reactivate" }).click();
    await expect(page.locator(ROW_SELECTOR).filter({ hasText: editedName }).getByText("retired")).toHaveCount(0);
  });
});
