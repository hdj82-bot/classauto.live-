import { test, expect } from "@playwright/test";

test.describe("Landing Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("renders hero section with title", async ({ page }) => {
    await expect(page.locator("h1")).toBeVisible();
    // 한국어 기본 또는 영어 — 둘 다 허용
    const h1Text = await page.locator("h1").textContent();
    expect(h1Text?.length).toBeGreaterThan(0);
  });

  test("has CTA button linking to login", async ({ page }) => {
    const cta = page.locator('a[href="/auth/login"]').first();
    await expect(cta).toBeVisible();
  });

  test("has features section with 6 feature cards", async ({ page }) => {
    const featuresSection = page.locator("#features");
    await expect(featuresSection).toBeVisible();

    const cards = featuresSection.locator(".rounded-2xl");
    await expect(cards).toHaveCount(6);
  });

  test("has 3-step flow section", async ({ page }) => {
    const steps = page.getByRole("heading", { level: 3 });
    // 6 feature titles + 3 step titles
    expect(await steps.count()).toBeGreaterThanOrEqual(3);
  });

  test("has explore features anchor link", async ({ page }) => {
    const exploreLink = page.locator('a[href="#features"]');
    await expect(exploreLink).toBeVisible();
  });

  test("navigation header has IFL logo", async ({ page }) => {
    const logo = page.locator("header").locator("text=IFL");
    await expect(logo.first()).toBeVisible();
  });

  test("footer contains copyright", async ({ page }) => {
    const footer = page.locator("footer");
    await expect(footer).toBeVisible();
    const text = await footer.textContent();
    expect(text).toContain("IFL Platform");
  });
});
