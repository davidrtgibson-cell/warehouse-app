import { test, expect } from "@playwright/test";
import { LEADER_EMAIL, login } from "./helpers";

test.describe("settings access control", () => {
  test("a LEADER is bounced from /settings and sees no Settings nav item", async ({ page }) => {
    await login(page, LEADER_EMAIL);

    await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);

    await page.goto("/settings");
    await expect(page).toHaveURL("/");
  });
});
