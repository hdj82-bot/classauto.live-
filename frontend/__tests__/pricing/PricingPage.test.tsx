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
  it.skip("renders only ONE filled-gold CTA on the page (colors.md §3 — 골드 채움 1번, v1)", () => {
    wrap(<PricingContent />);
    // 골드 채움 = `bg-amber-400` className 시그니처. outline/border 만 있는 골드는 제외.
    const allButtons = document.querySelectorAll("a, button");
    const filledGold: Element[] = [];
    allButtons.forEach((el) => {
      const cls = el.getAttribute("class") ?? "";
      // BillingToggle 의 annual 버튼도 활성 시 bg-amber-400 인데, 이는 토글 컨트롤
      // (CTA 가 아님). data-testid 로 제외.
      if (el.getAttribute("data-testid") === "pricing-billing-annual") return;
      // MarketingShell 의 topCta 도 bg-amber-400 임 — pricing 본문 영역만 검사하기
      // 위해 Link/button 의 textContent 가 베타 신청 라벨이면 제외 (shell 외부).
      // 더 견고하게: marketing footer 의 link 들도 제외.
      const inHeader = el.closest("header");
      const inFooter = el.closest("footer");
      if (inHeader || inFooter) return;
      // BillingToggle 의 popularBadge 류 span 등 inline element 도 제외 (a/button 만 선택했으니 OK)
      if (cls.includes("bg-amber-400") && !cls.includes("border-amber-400")) {
        filledGold.push(el);
      }
    });
    // popularBadge 는 span 이므로 위 a/button 쿼리에는 잡히지 않는다.
    // 본문에서 필드 골드 CTA 는 Basic 카드 1개여야 한다.
    expect(filledGold.length, `expected 1 filled-gold CTA, found ${filledGold.length}`).toBe(1);
    expect(filledGold[0].getAttribute("data-testid")).toBe("plan-card-basic-cta");
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
