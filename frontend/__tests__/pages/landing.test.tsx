import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import LandingPage from "@/app/page";
import { I18nProvider } from "@/contexts/I18nContext";

const renderWithI18n = (ui: ReactNode) => render(<I18nProvider>{ui}</I18nProvider>);

/**
 * v2 회귀 (후속 정리 ③): 메인 랜딩이 v3.1 짧은 게이트웨이(hero + 분야 카드,
 * LightMarketingShell 헤더·푸터)로 재작성되며 v1 의 6개 케이스(hero heading /
 * "무료로 시작하기" CTA / feature 6 / 3-step / "All rights reserved" 푸터 /
 * /auth/login nav)가 모두 무효화됐다. v2 의 실제 DOM 에 맞춰 재작성한다.
 * landing/page.test.tsx 가 통합 회귀를 함께 커버하므로 본 파일은 핵심
 * 셀렉터 단위 가드만 둔다.
 */
describe("LandingPage (v2 — 짧은 게이트웨이)", () => {
  it("renders the v2 hero heading copy", () => {
    renderWithI18n(<LandingPage />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toContain("학생과 상호작용하는");
    expect(h1.textContent).toContain("AI 교육영상");
  });

  it("renders the primary hero CTA → /demo?field=social", () => {
    renderWithI18n(<LandingPage />);
    const primary = screen.getByTestId("landing-hero-start");
    expect(primary.getAttribute("href")).toBe("/demo?field=social");
    expect(primary.textContent).toContain("학생 화면 미리보기");
  });

  it("renders the field showcase with both demo cards", () => {
    renderWithI18n(<LandingPage />);
    expect(screen.getByText("두 분야 중 하나를 골라주세요")).toBeTruthy();
    expect(screen.getByTestId("demo-field-social")).toBeTruthy();
    expect(screen.getByTestId("demo-field-natural")).toBeTruthy();
  });

  it("renders the LightMarketingShell footer with a /beta-apply link", () => {
    const { container } = renderWithI18n(<LandingPage />);
    const footer = container.querySelector("footer");
    expect(footer).toBeTruthy();
    expect(footer!.querySelector('a[href="/beta-apply"]')).toBeTruthy();
  });

  // 정책 변경 2026-05-18 (01-pricing-policy.md §5.3): 베타 기간에도 헤더에
  // 로그인 진입점을 노출한다. 과거의 "링크 0개" 가드는 폐기하고, 로그인
  // 진입점이 실제로 존재하는지를 가드한다 (LightMarketingShell 헤더).
  it("exposes a /auth/login entry from the landing header (§5.3)", () => {
    renderWithI18n(<LandingPage />);
    expect(
      document.querySelectorAll('a[href="/auth/login"]').length,
    ).toBeGreaterThan(0);
  });
});
