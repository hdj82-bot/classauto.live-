import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StreakHeatmap from "@/components/student/profile/StreakHeatmap";
import { I18nProvider } from "@/contexts/I18nContext";
import type { StreakSummary } from "@/components/student/profile/types";

const wrap = (ui: React.ReactNode) =>
  render(<I18nProvider>{ui}</I18nProvider>);

const emptyData: StreakSummary = {
  currentDays: 0,
  longestDays: 0,
  thisWeekDays: 0,
  days: [],
};

const fullData: StreakSummary = {
  currentDays: 12,
  longestDays: 20,
  thisWeekDays: 5,
  days: Array.from({ length: 14 }, (_, i) => ({
    date: `2026-04-${String(i + 1).padStart(2, "0")}`,
    watchedMinutes: i % 4 === 0 ? 0 : (i + 1) * 4,
  })),
};

describe("StreakHeatmap", () => {
  it("renders the empty-streak subtitle when currentDays === 0", () => {
    wrap(<StreakHeatmap data={emptyData} />);
    expect(screen.getByTestId("profile-streak")).toBeTruthy();
    // subtitleZero 문구
    expect(screen.getByText(/오늘 첫 영상부터/)).toBeTruthy();
  });

  it("renders streak days with proper intensity buckets and aria titles", () => {
    wrap(<StreakHeatmap data={fullData} />);
    // 모든 날짜 셀이 출현
    for (const d of fullData.days) {
      expect(screen.getByTestId(`streak-cell-${d.date}`)).toBeTruthy();
    }
    // 강도 0~4 가 적어도 한 번은 등장
    const cells = screen.getAllByTestId(/^streak-cell-/);
    const intensities = new Set(
      cells.map((c) => Number(c.getAttribute("data-intensity"))),
    );
    expect(intensities.has(0)).toBe(true);
    // 비-0 강도 중 적어도 하나 등장
    const nonZero = [...intensities].filter((i) => i !== 0);
    expect(nonZero.length).toBeGreaterThan(0);
  });

  it("renders 'X days streak' subtitle when current > 0", () => {
    wrap(<StreakHeatmap data={fullData} />);
    expect(screen.getByText(/12일 연속 학습 중/)).toBeTruthy();
    expect(screen.getByText(/이번 주 5일/)).toBeTruthy();
    expect(screen.getByText(/최장 연속 20일/)).toBeTruthy();
  });
});
