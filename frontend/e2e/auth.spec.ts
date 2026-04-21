import { test, expect } from "@playwright/test";

test.describe("Login Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/auth/login");
  });

  test("renders login page with title", async ({ page }) => {
    await expect(page.locator("h1")).toBeVisible();
    const title = await page.locator("h1").textContent();
    expect(title).toContain("Interactive Flipped Learning");
  });

  test("displays role selection buttons", async ({ page }) => {
    // 학습자/Student + 교수자/Professor 버튼
    const roleButtons = page.locator("fieldset button[type='button']");
    await expect(roleButtons).toHaveCount(2);
  });

  test("student role is selected by default", async ({ page }) => {
    const studentBtn = page.locator("button[aria-pressed='true']");
    await expect(studentBtn).toHaveCount(1);
  });

  test("can switch role to professor", async ({ page }) => {
    // 두 번째 role 버튼 (교수자) 클릭
    const profButton = page.locator("fieldset button[type='button']").nth(1);
    await profButton.click();
    await expect(profButton).toHaveAttribute("aria-pressed", "true");
  });

  test("has Google login button", async ({ page }) => {
    const googleBtn = page.locator("button").filter({ hasText: /Google/ });
    await expect(googleBtn).toBeVisible();
  });

  test("has terms and privacy links", async ({ page }) => {
    await expect(page.locator('a[href="/terms"]')).toBeVisible();
    await expect(page.locator('a[href="/privacy"]')).toBeVisible();
  });

  test("shows error message for invalid_state param", async ({ page }) => {
    await page.goto("/auth/login?error=invalid_state");
    const alert = page.locator("[role='alert'].bg-red-50");
    await expect(alert).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Complete Profile Page", () => {
  test("redirects to login without temp_token", async ({ page }) => {
    await page.goto("/auth/complete-profile");
    await page.waitForURL("**/auth/login");
    expect(page.url()).toContain("/auth/login");
  });
});
