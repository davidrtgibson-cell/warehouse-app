import { test, expect } from "@playwright/test";
import { DEV_PASSWORD, LEADER_EMAIL, login } from "./helpers";

// Self-service password change — must work for a LEADER, not just ADMIN
// (unlike everything under /settings, which is ADMIN-only — see
// settings-admin-only.spec.ts). The "change it back to DEV_PASSWORD"
// step at the end of the happy-path test isn't cleanup for its own sake —
// every other spec logs LEADER_EMAIL in with the shared seeded
// DEV_PASSWORD, and this suite runs single-worker/sequentially against one
// shared seeded database, so leaving the password changed would break
// whichever spec file happens to run next.
test.describe("account / change password", () => {
  test("rejects the wrong current password and makes no change", async ({ page }) => {
    await login(page, LEADER_EMAIL);
    await page.goto("/account");

    await page.getByLabel("Current password").fill("definitely-not-it");
    await page.getByLabel("New password", { exact: true }).fill("a-new-password-123");
    await page.getByLabel("Confirm new password").fill("a-new-password-123");
    await page.getByRole("button", { name: "Change password" }).click();

    await expect(page.getByText("Current password is incorrect")).toBeVisible();
  });

  test("rejects mismatched new/confirm passwords client-side", async ({ page }) => {
    await login(page, LEADER_EMAIL);
    await page.goto("/account");

    await page.getByLabel("Current password").fill(DEV_PASSWORD);
    await page.getByLabel("New password", { exact: true }).fill("a-new-password-123");
    await page.getByLabel("Confirm new password").fill("does-not-match");
    await page.getByRole("button", { name: "Change password" }).click();

    await expect(page.getByText("New passwords don't match")).toBeVisible();
  });

  test("changes the password, signs in with the new one, then reverts it", async ({ page }) => {
    const tempPassword = "a-temporary-password-123";

    await login(page, LEADER_EMAIL);
    await page.goto("/account");
    await page.getByLabel("Current password").fill(DEV_PASSWORD);
    await page.getByLabel("New password", { exact: true }).fill(tempPassword);
    await page.getByLabel("Confirm new password").fill(tempPassword);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("Password changed.")).toBeVisible();

    // Old password no longer works.
    await page.getByRole("button", { name: "Log out" }).click();
    await login(page, LEADER_EMAIL, tempPassword);
    await expect(page).toHaveURL("/");

    // Restore DEV_PASSWORD so every other spec's login(page, LEADER_EMAIL) keeps working.
    await page.goto("/account");
    await page.getByLabel("Current password").fill(tempPassword);
    await page.getByLabel("New password", { exact: true }).fill(DEV_PASSWORD);
    await page.getByLabel("Confirm new password").fill(DEV_PASSWORD);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("Password changed.")).toBeVisible();
  });
});
