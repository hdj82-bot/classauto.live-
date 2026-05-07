import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/contexts/I18nContext";
import Donut from "@/components/professor/dashboardHome/Donut";

const wrap = (ui: React.ReactNode) => <I18nProvider>{ui}</I18nProvider>;

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((q: string) => ({
      matches: true, // prefers-reduced-motion=reduce 가정 — 카운트업 즉시 표시
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

describe("Donut", () => {
  it("renders the empty fallback when total is 0", () => {
    render(
      wrap(
        <Donut
          data={{ completed: 0, inProgress: 0, notStarted: 0, total: 0 }}
        />,
      ),
    );
    expect(screen.getByText("아직 학습자 등록이 없습니다.")).toBeTruthy();
  });

  it("renders 3 segments with labels and percentages", () => {
    const { container } = render(
      wrap(
        <Donut
          data={{ completed: 5, inProgress: 3, notStarted: 2, total: 10 }}
        />,
      ),
    );
    // 범례 라벨
    expect(screen.getByText("완료")).toBeTruthy();
    expect(screen.getByText("진행 중")).toBeTruthy();
    expect(screen.getByText("미시작")).toBeTruthy();

    // SVG circle segment 가 3개 이상 (도넛 + 패턴 정의)
    const circles = container.querySelectorAll("svg circle");
    expect(circles.length).toBeGreaterThanOrEqual(3);
  });
});
