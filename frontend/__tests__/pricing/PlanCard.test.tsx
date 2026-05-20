import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PlanCard from "@/components/pricing/PlanCard";
import { PLANS } from "@/components/pricing/plans";
import { I18nProvider } from "@/contexts/I18nContext";

const wrap = (ui: React.ReactNode) =>
  render(<I18nProvider>{ui}</I18nProvider>);

/**
 * 2026 베타 모드: PlanCard 는 가격·결제 CTA·인기 배지를 모두 렌더하지 않고
 * 기능 목록과 "세부 한도 보기" 버튼만 노출한다. 가격/CTA 회귀 가드는 본 PR 의
 * `PricingPage.test.tsx` 의 grid-level 어서션에서 이어진다.
 */
describe("PlanCard (beta mode)", () => {
  it("renders Free with the perMonthLabel caption (no won amount)", () => {
    wrap(<PlanCard plan={PLANS.free} onOpenLimits={() => {}} />);
    expect(screen.getByTestId("plan-card-free")).toBeTruthy();
    expect(screen.queryByTestId("price-display-amount")).toBeNull();
    expect(screen.queryByTestId("price-display-free")).toBeNull();
    expect(screen.queryByTestId("price-display-hidden")).toBeNull();
    expect(screen.getByText(/영원히 무료|Free forever/)).toBeTruthy();
  });

  it("never renders any price or per-card CTA for paid plans", () => {
    wrap(<PlanCard plan={PLANS.basic} highlighted onOpenLimits={() => {}} />);
    expect(screen.queryByTestId("price-display-amount")).toBeNull();
    expect(screen.queryByTestId("price-display-hidden")).toBeNull();
    expect(screen.queryByTestId("plan-card-basic-cta")).toBeNull();
    expect(screen.queryByTestId("plan-card-basic-savings")).toBeNull();
    expect(screen.queryByTestId("plan-card-basic-popular")).toBeNull();
  });

  it("flags Basic as highlighted and Free as not (data-highlighted attribute)", () => {
    const { rerender } = wrap(
      <PlanCard plan={PLANS.basic} highlighted onOpenLimits={() => {}} />,
    );
    expect(
      screen.getByTestId("plan-card-basic").getAttribute("data-highlighted"),
    ).toBe("true");

    rerender(
      <I18nProvider>
        <PlanCard plan={PLANS.free} onOpenLimits={() => {}} />
      </I18nProvider>,
    );
    expect(
      screen.getByTestId("plan-card-free").getAttribute("data-highlighted"),
    ).toBe("false");
  });

  it("invokes onOpenLimits with the plan id when ⓘ button clicked", () => {
    const onOpen = vi.fn();
    wrap(<PlanCard plan={PLANS.pro} onOpenLimits={onOpen} />);
    fireEvent.click(screen.getByTestId("plan-card-pro-view-limits"));
    expect(onOpen).toHaveBeenCalledWith("pro");
  });
});
