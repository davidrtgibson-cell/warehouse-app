import { test, expect } from "@playwright/test";
import { ADMIN_EMAIL, DEV_PASSWORD, login } from "./helpers";

test.describe("login", () => {
  test("unauthenticated visitor is redirected to /login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Warehouse App" })).toBeVisible();
  });

  test("rejects the wrong password", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(ADMIN_EMAIL);
    await page.getByLabel("Password").fill("not-the-right-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/failed to sign in|invalid/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("signs in, lands on the home page, and can log out", async ({ page }) => {
    await login(page, ADMIN_EMAIL, DEV_PASSWORD);
    await expect(page).toHaveURL("/");
    await expect(page.getByText("Priya Deshmukh")).toBeVisible();

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
