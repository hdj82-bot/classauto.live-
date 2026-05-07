import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PlanCard from "@/components/pricing/PlanCard";
import { PLANS } from "@/components/pricing/plans";
import { I18nProvider } from "@/contexts/I18nContext";

const wrap = (ui: React.ReactNode) =>
  render(<I18nProvider>{ui}</I18nProvider>);

describe("PlanCard", () => {
  it("renders Free as 무료 (no won amount)", () => {
    wrap(
      <PlanCard
        plan={PLANS.free}
        cycle="annual"
        onOpenLimits={() => {}}
      />,
    );
    expect(screen.getByTestId("plan-card-free")).toBeTruthy();
    expect(screen.getByTestId("price-display-free")).toBeTruthy();
    expect(screen.queryByTestId("price-display-amount")).toBeNull();
  });

  it("renders Basic price ₩15,200 in annual cycle and ₩19,000 in monthly", () => {
    const { rerender } = wrap(
      <PlanCard
        plan={PLANS.basic}
        cycle="annual"
        highlighted
        onOpenLimits={() => {}}
      />,
    );
    let amount = screen.getByTestId("price-display-amount");
    expect(amount.textContent?.replace(/[^0-9]/g, "")).toBe("15200");
    expect(amount.getAttribute("data-cycle")).toBe("annual");

    rerender(
      <I18nProvider>
        <PlanCard
          plan={PLANS.basic}
          cycle="monthly"
          highlighted
          onOpenLimits={() => {}}
        />
      </I18nProvider>,
    );
    amount = screen.getByTestId("price-display-amount");
    expect(amount.textContent?.replace(/[^0-9]/g, "")).toBe("19000");
    expect(amount.getAttribute("data-cycle")).toBe("monthly");
  });

  it("flags Basic as highlighted/popular and Free as not", () => {
    const { rerender } = wrap(
      <PlanCard plan={PLANS.basic} cycle="annual" highlighted onOpenLimits={() => {}} />,
    );
    expect(
      screen.getByTestId("plan-card-basic").getAttribute("data-highlighted"),
    ).toBe("true");
    expect(screen.getByTestId("plan-card-basic-popular")).toBeTruthy();

    rerender(
      <I18nProvider>
        <PlanCard plan={PLANS.free} cycle="annual" onOpenLimits={() => {}} />
      </I18nProvider>,
    );
    expect(
      screen.getByTestId("plan-card-free").getAttribute("data-highlighted"),
    ).toBe("false");
    expect(screen.queryByTestId("plan-card-free-popular")).toBeNull();
  });

  it("invokes onOpenLimits with the plan id when ⓘ button clicked", () => {
    const onOpen = vi.fn();
    wrap(
      <PlanCard plan={PLANS.pro} cycle="annual" onOpenLimits={onOpen} />,
    );
    fireEvent.click(screen.getByTestId("plan-card-pro-view-limits"));
    expect(onOpen).toHaveBeenCalledWith("pro");
  });

  it("shows annual savings caption for paid plans on annual cycle", () => {
    wrap(
      <PlanCard plan={PLANS.basic} cycle="annual" highlighted onOpenLimits={() => {}} />,
    );
    const savings = screen.getByTestId("plan-card-basic-savings");
    expect(savings.textContent).toMatch(/45,600/);
  });

  it("Basic CTA targets the existing /professor/subscription page (Stripe handoff)", () => {
    wrap(
      <PlanCard plan={PLANS.basic} cycle="annual" highlighted onOpenLimits={() => {}} />,
    );
    const cta = screen.getByTestId("plan-card-basic-cta") as HTMLAnchorElement;
    expect(cta.getAttribute("href")).toBe("/professor/subscription");
  });
});
