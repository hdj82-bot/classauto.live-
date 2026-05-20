import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import PricingContent from "@/components/pricing/PricingContent";
import { I18nProvider } from "@/contexts/I18nContext";

const wrap = (ui: React.ReactNode) =>
  render(<I18nProvider>{ui}</I18nProvider>);

/**
 * 2026 베타 모드 (사용자 결정 2026-05-20):
 *   - 가격 표기, 월/연 결제 토글, 카드별 결제 CTA, 결제·해지·환불 정책 섹션을
 *     모두 제거하고 페이지 하단의 단일 "베타 신청하기" 버튼으로 통합한다.
 *   - 한도 비교표·기관 라이선스·FAQ·베타 콜아웃은 유지한다.
 */
describe("/pricing — beta-mode composition", () => {
  it("renders the required sections (cards, beta callout, limits, enterprise, faq, footer)", () => {
    wrap(<PricingContent />);
    expect(screen.getByTestId("pricing-plan-grid")).toBeTruthy();
    expect(screen.getByTestId("plan-card-free")).toBeTruthy();
    expect(screen.getByTestId("plan-card-basic")).toBeTruthy();
    expect(screen.getByTestId("plan-card-pro")).toBeTruthy();
    expect(screen.getByTestId("pricing-beta-callout")).toBeTruthy();
    expect(screen.getByTestId("pricing-limits-table")).toBeTruthy();
    expect(screen.getByTestId("pricing-enterprise")).toBeTruthy();
    expect(screen.getByTestId("pricing-faq")).toBeTruthy();
    expect(screen.getByTestId("pricing-footer-primary")).toBeTruthy();
  });

  it("removes the billing-cycle toggle entirely (no monthly/annual buttons)", () => {
    wrap(<PricingContent />);
    expect(screen.queryByTestId("pricing-billing-toggle")).toBeNull();
    expect(screen.queryByTestId("pricing-billing-monthly")).toBeNull();
    expect(screen.queryByTestId("pricing-billing-annual")).toBeNull();
  });

  it("removes per-card prices and CTAs (none of free/basic/pro show prices)", () => {
    wrap(<PricingContent />);
    for (const id of ["free", "basic", "pro"] as const) {
      const card = screen.getByTestId(`plan-card-${id}`);
      expect(within(card).queryByTestId("price-display-amount")).toBeNull();
      expect(within(card).queryByTestId("price-display-free")).toBeNull();
      expect(within(card).queryByTestId("price-display-hidden")).toBeNull();
      expect(within(card).queryByTestId(`plan-card-${id}-cta`)).toBeNull();
      expect(within(card).queryByTestId(`plan-card-${id}-savings`)).toBeNull();
      expect(within(card).queryByTestId(`plan-card-${id}-popular`)).toBeNull();
    }
  });

  it("removes the billing/cancellation/refund policy section", () => {
    wrap(<PricingContent />);
    expect(screen.queryByTestId("pricing-policies")).toBeNull();
  });

  it("exposes a single beta-application path in the footer CTA", () => {
    wrap(<PricingContent />);
    const primary = screen.getByTestId("pricing-footer-primary") as HTMLAnchorElement;
    expect(primary.getAttribute("href")).toBe("/beta-apply");
  });

  it("keeps a prominent beta callout with a beta-apply link", () => {
    wrap(<PricingContent />);
    const cta = screen.getByTestId("pricing-beta-callout-cta") as HTMLAnchorElement;
    expect(cta.getAttribute("href")).toBe("/beta-apply");
  });

  it("opens the limits modal from a plan card and closes it via close button", () => {
    wrap(<PricingContent />);
    expect(screen.queryByTestId("pricing-limits-modal")).toBeNull();
    fireEvent.click(screen.getByTestId("plan-card-pro-view-limits"));
    expect(screen.getByTestId("pricing-limits-modal")).toBeTruthy();
    fireEvent.click(screen.getByTestId("pricing-limits-modal-close"));
    expect(screen.queryByTestId("pricing-limits-modal")).toBeNull();
  });

  it("does not register any localStorage writes (constraint: localStorage 사용 0건)", () => {
    const calls: Array<[string, string]> = [];
    const origSet = window.localStorage.setItem;
    window.localStorage.setItem = vi.fn((k: string, v: string) => {
      calls.push([k, v]);
      origSet.call(window.localStorage, k, v);
    });
    try {
      wrap(<PricingContent />);
      fireEvent.click(screen.getByTestId("plan-card-basic-view-limits"));
      fireEvent.click(screen.getByTestId("pricing-limits-modal-close"));
    } finally {
      window.localStorage.setItem = origSet;
    }
    expect(calls).toEqual([]);
  });
});
