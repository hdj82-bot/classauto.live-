import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/contexts/I18nContext";
import CostMeterBar from "@/components/professor/dashboardHome/CostMeterBar";

const wrap = (ui: React.ReactNode) => <I18nProvider>{ui}</I18nProvider>;

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((q: string) => ({
      matches: true, // 즉시 표시
      media: q,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

describe("CostMeterBar", () => {
  it("hides progress bar fill when no limit is provided", () => {
    const { container } = render(
      wrap(<CostMeterBar usedUsd={42} limitUsd={null} />),
    );
    expect(screen.getByText(/한도 미설정/)).toBeTruthy();
    const bar = container.querySelector('[role="progressbar"]') as HTMLElement;
    expect(bar.getAttribute("aria-valuenow")).toBe("0");
  });

  it("activates the 80% warning copy when used >= 80% of limit", () => {
    render(wrap(<CostMeterBar usedUsd={170} limitUsd={200} />));
    expect(screen.getByText(/한도의 80%를 넘었습니다\./)).toBeTruthy();
  });

  it("activates the 100% warning when used >= limit", () => {
    render(wrap(<CostMeterBar usedUsd={250} limitUsd={200} />));
    expect(screen.getByText(/한도를 초과했습니다\./)).toBeTruthy();
  });
});
