import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SlidePanel, {
  type StudioSlide,
} from "@/components/professor/studio/v2/SlidePanel";

/**
 * SlidePanel — `isLoading` 분석 단계 분기를 검증.
 *
 * 컨트랙트 (Window 3 — SlidePanel loading skeleton):
 *  - `isLoading=true && slides.length===0` 이면
 *    · 헤더 우측 "{n}장" 자리에 "분석 중" 텍스트
 *    · shimmer skeleton 카드 5장 mount (data-testid="slidepanel-analyzing")
 *    · "슬라이드 추가" 하단 dashed 버튼은 mount 하지 않음
 *  - 슬라이드가 1장이라도 도착하면 즉시 일반 렌더로 복귀
 */
describe("SlidePanel — isLoading shimmer skeleton", () => {
  it("renders 5 shimmer cards and 분석 중 label, hides 슬라이드 추가 button", () => {
    render(
      <SlidePanel
        slides={[]}
        activeIndex={0}
        onSelect={vi.fn()}
        isLoading
      />,
    );

    // 헤더 우측 라벨이 "분석 중" 으로 대체됨.
    expect(screen.getByText("분석 중")).toBeTruthy();

    // shimmer 카드 5장이 mount 됨.
    const ul = screen.getByTestId("slidepanel-analyzing");
    const cards = ul.querySelectorAll("li");
    expect(cards.length).toBe(5);

    // "슬라이드 추가" 버튼은 mount 되지 않음.
    expect(screen.queryByText("슬라이드 추가")).toBeNull();
  });

  it("falls back to normal render when slides arrive even if isLoading remains true", () => {
    const slides: StudioSlide[] = [
      { index: 0, title: "把자문 구조", status: "pending" },
    ];
    render(
      <SlidePanel
        slides={slides}
        activeIndex={0}
        onSelect={vi.fn()}
        isLoading
      />,
    );

    // 헤더가 "1장" 으로 복귀.
    expect(screen.getByText("1장")).toBeTruthy();
    // 분석 중 라벨 사라짐.
    expect(screen.queryByText("분석 중")).toBeNull();
    // 슬라이드 추가 버튼 다시 mount.
    expect(screen.getByText("슬라이드 추가")).toBeTruthy();
  });
});
