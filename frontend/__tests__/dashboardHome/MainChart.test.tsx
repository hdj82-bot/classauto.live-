import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/contexts/I18nContext";
import MainChart from "@/components/professor/dashboardHome/MainChart";
import type { MainChartLectureSeries } from "@/components/professor/dashboardHome/types";

const wrap = (ui: React.ReactNode) => <I18nProvider>{ui}</I18nProvider>;

describe("MainChart", () => {
  it("renders the empty fallback when every series is null", () => {
    const series: MainChartLectureSeries[] = [
      {
        lectureId: "L1",
        title: "강의 A",
        weeklyCompletion: [null, null, null, null, null, null, null, null],
      },
    ];
    render(wrap(<MainChart series={series} />));
    expect(
      screen.getByText("아직 시청 데이터가 충분하지 않습니다."),
    ).toBeTruthy();
  });

  it("renders an SVG line with toggleable lecture chips when data exists", () => {
    const series: MainChartLectureSeries[] = [
      {
        lectureId: "L1",
        title: "디지털 위안화",
        weeklyCompletion: [10, 30, 50, 70, 80, 85, 90, 92],
      },
      {
        lectureId: "L2",
        title: "AI 번역 오류",
        weeklyCompletion: [null, 20, 25, 40, null, 60, 70, 80],
      },
    ];
    const { container } = render(wrap(<MainChart series={series} />));

    // 토글 칩
    expect(screen.getByText("디지털 위안화")).toBeTruthy();
    expect(screen.getByText("AI 번역 오류")).toBeTruthy();

    // SVG 가 그려지고 path 가 한 개 이상
    const paths = container.querySelectorAll("svg path");
    expect(paths.length).toBeGreaterThan(0);
  });
});
