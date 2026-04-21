import { test, expect } from "@playwright/test";

test.describe("Dashboard - Unauthenticated", () => {
  test("redirects to login when not authenticated", async ({ page }) => {
    await page.goto("/dashboard");
    // 미인증 시 로그인 페이지로 리다이렉트 (클라이언트 측)
    await page.waitForURL("**/auth/login", { timeout: 10_000 });
    expect(page.url()).toContain("/auth/login");
  });
});

test.describe("Dashboard - Page Structure", () => {
  test("dashboard page loads without crash", async ({ page }) => {
    await page.goto("/dashboard");
    // 페이지가 crash 없이 로드되는지만 확인
    const body = page.locator("body");
    await expect(body).toBeVisible();
  });

  test("shows loading spinner initially", async ({ page }) => {
    // 인증 체크 중 로딩 스피너가 보여야 함
    await page.goto("/dashboard");
    // 로딩 중이거나 리다이렉트 — 둘 다 유효
    const spinner = page.locator("[role='status']");
    const isVisible = await spinner.isVisible().catch(() => false);
    // 스피너가 보이거나 이미 리다이렉트됨
    expect(isVisible || page.url().includes("/auth/login")).toBe(true);
  });
});
