import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/contexts/I18nContext";
import WatchHeatmap from "@/components/professor/analytics/WatchHeatmap";
import type { WatchHeatmapData } from "@/components/professor/analytics/types";

const wrap = (ui: React.ReactNode) => (
  <I18nProvider>{ui}</I18nProvider>
);

describe("WatchHeatmap", () => {
  it("renders the comingSoon fallback when data is null (backend pending)", () => {
    render(wrap(<WatchHeatmap data={null} />));
    expect(
      screen.getByText("재생 구간 히트맵 데이터를 준비 중입니다."),
    ).toBeTruthy();
    // BACKEND_ASKS 안내 문구가 함께 노출
    expect(
      screen.getByText(/BACKEND_ASKS\.ANALYTICS\.md/),
    ).toBeTruthy();
  });

  it("renders the comingSoon fallback when slides array is empty", () => {
    const data: WatchHeatmapData = { lecture_id: "L1", slides: [] };
    render(wrap(<WatchHeatmap data={data} />));
    expect(
      screen.getByText("재생 구간 히트맵 데이터를 준비 중입니다."),
    ).toBeTruthy();
  });

  it("renders heatmap cells when slides arrive", () => {
    const data: WatchHeatmapData = {
      lecture_id: "L1",
      slides: [
        { index: 0, replays: 12, drops: 0 },
        { index: 1, replays: 4, drops: 3 },
        { index: 2, replays: 0, drops: 0 },
      ],
    };
    const { container } = render(wrap(<WatchHeatmap data={data} />));
    const rects = container.querySelectorAll("svg rect[rx='8']");
    expect(rects.length).toBeGreaterThanOrEqual(3);
    // 재시청 횟수 텍스트 (가장 큰 셀)
    expect(screen.getByText("12")).toBeTruthy();
  });
});
