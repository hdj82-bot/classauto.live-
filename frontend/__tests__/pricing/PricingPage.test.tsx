import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import PricingContent from "@/components/pricing/PricingContent";
import { I18nProvider } from "@/contexts/I18nContext";

const wrap = (ui: React.ReactNode) =>
  render(<I18nProvider>{ui}</I18nProvider>);

describe("/pricing — full page composition", () => {
  it("renders all required sections (cards, beta, limits, enterprise, policies, faq, footer)", () => {
    wrap(<PricingContent />);
    expect(screen.getByTestId("pricing-plan-grid")).toBeTruthy();
    expect(screen.getByTestId("plan-card-free")).toBeTruthy();
    expect(screen.getByTestId("plan-card-basic")).toBeTruthy();
    expect(screen.getByTestId("plan-card-pro")).toBeTruthy();
    expect(screen.getByTestId("pricing-beta-callout")).toBeTruthy();
    expect(screen.getByTestId("pricing-limits-table")).toBeTruthy();
    expect(screen.getByTestId("pricing-enterprise")).toBeTruthy();
    expect(screen.getByTestId("pricing-policies")).toBeTruthy();
    expect(screen.getByTestId("pricing-faq")).toBeTruthy();
    expect(screen.getByTestId("pricing-footer-primary")).toBeTruthy();
  });

  // 사용자 결정 2026-05-13 PM: 베타 기간 동안 Basic/Pro 가격을 미공개로 전환
  // (PricingContent 가 두 플랜에 hideForBeta={true} 전달). 가격 amount 가
  // 노출되지 않고 hidden(`-`) 셀이 그 자리를 차지하므로, 옛 amount 어서션을
  // hidden cell 어서션으로 교체. cycle 토글 자체는 aria-pressed 로 검증.
  it("starts on annual cycle by default (정책 §4.1 anchoring)", () => {
    wrap(<PricingContent />);
    const annualBtn = screen.getByTestId("pricing-billing-annual");
    expect(annualBtn.getAttribute("aria-pressed")).toBe("true");
    const basicCard = screen.getByTestId("plan-card-basic");
    // 가격 amount 는 hideForBeta 로 가려졌고 hidden cell 의 cycle 만 검증.
    expect(within(basicCard).queryByTestId("price-display-amount")).toBeNull();
    const hidden = within(basicCard).getByTestId("price-display-hidden");
    expect(hidden.getAttribute("data-cycle")).toBe("annual");
    expect(hidden.textContent).toContain("—");
  });

  it("toggling to monthly switches the billing cycle (price stays hidden during beta)", () => {
    wrap(<PricingContent />);
    fireEvent.click(screen.getByTestId("pricing-billing-monthly"));
    const monthlyBtn = screen.getByTestId("pricing-billing-monthly");
    expect(monthlyBtn.getAttribute("aria-pressed")).toBe("true");
    const basicCard = screen.getByTestId("plan-card-basic");
    expect(within(basicCard).queryByTestId("price-display-amount")).toBeNull();
    const hidden = within(basicCard).getByTestId("price-display-hidden");
    expect(hidden.getAttribute("data-cycle")).toBe("monthly");
  });

  it("opens the limits modal from a plan card and closes it via close button", () => {
    wrap(<PricingContent />);
    expect(screen.queryByTestId("pricing-limits-modal")).toBeNull();
    fireEvent.click(screen.getByTestId("plan-card-pro-view-limits"));
    expect(screen.getByTestId("pricing-limits-modal")).toBeTruthy();
    fireEvent.click(screen.getByTestId("pricing-limits-modal-close"));
    expect(screen.queryByTestId("pricing-limits-modal")).toBeNull();
  });

  // v2 (2026-05-13): pricing 페이지가 v2 디자인으로 재작성되어 filled-gold CTA
  // 카운트·셀렉터가 변경됨. 후속 PR 에서 새 카운트 어서션 작성.
  // v2 회귀 (후속 정리 ③): v1 의 `bg-amber-400` className 시그니처 휴리스틱은
  // v2 에서 무효 — PlanCard 가 highlighted(=Basic)에만 inline
  // `backgroundColor:#FFB627` 골드 채움을 주고 나머지는 outline 이다
  // (colors.md §3 "CTA 골드 채움 1번"). v2 의 안정 셀렉터(data-highlighted +
  // 카드 CTA inline 배경)로 "골드 채움 CTA 는 Basic 1개" 규칙을 가드한다.
  // jsdom 은 inline `#FFB627` 를 `rgb(255, 182, 39)` 로 정규화한다.
  it("applies the single gold-filled plan CTA to Basic only (colors.md §3, v2)", () => {
    wrap(<PricingContent />);
    const GOLD = "rgb(255, 182, 39)";

    const grid = screen.getByTestId("pricing-plan-grid");
    const cards = within(grid).getAllByTestId(/^plan-card-(free|basic|pro)$/);
    const highlighted = cards.filter(
      (c) => c.getAttribute("data-highlighted") === "true",
    );
    // 정확히 1장(= Basic)만 강조 카드
    expect(highlighted.length).toBe(1);
    expect(highlighted[0].getAttribute("data-testid")).toBe("plan-card-basic");

    const basicCta = screen.getByTestId("plan-card-basic-cta") as HTMLElement;
    const freeCta = screen.getByTestId("plan-card-free-cta") as HTMLElement;
    const proCta = screen.getByTestId("plan-card-pro-cta") as HTMLElement;

    // Basic CTA 만 골드 채움, 나머지는 채움 없음(outline)
    expect(basicCta.style.backgroundColor).toBe(GOLD);
    expect(freeCta.style.backgroundColor).not.toBe(GOLD);
    expect(proCta.style.backgroundColor).not.toBe(GOLD);
  });

  it("does not register any localStorage writes (constraint: localStorage 사용 0건)", () => {
    const calls: Array<[string, string]> = [];
    const origSet = window.localStorage.setItem;
    window.localStorage.setItem = (k: string, v: string) => {
      calls.push([k, v]);
      origSet.call(window.localStorage, k, v);
    };
    try {
      wrap(<PricingContent />);
      fireEvent.click(screen.getByTestId("pricing-billing-monthly"));
      fireEvent.click(screen.getByTestId("plan-card-basic-view-limits"));
      fireEvent.click(screen.getByTestId("pricing-limits-modal-close"));
    } finally {
      window.localStorage.setItem = origSet;
    }
    // I18nProvider 등 외부가 setLocale 호출하지 않는 한 빈 배열이어야 함.
    expect(calls).toEqual([]);
  });
});
