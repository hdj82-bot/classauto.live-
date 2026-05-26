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

/**
 * 카드 레이아웃 — 발화 텍스트 제거, 네모 칸에 PPT 이미지, 우측에 페이지 번호.
 */
describe("SlidePanel — slide card (PPT image + page number)", () => {
  const slides: StudioSlide[] = [
    {
      index: 0,
      title: "안녕하세요 중국어 번역 작문 2주차",
      status: "empty",
      imageUrl: "https://cdn.example.com/s/1.png",
    },
    {
      index: 1,
      title: "중국어 문장을 살펴보겠습니다",
      status: "pending",
      imageUrl: null,
      thumbChar: "她",
    },
  ];

  it("shows page numbers (01, 02) and hides the utterance text", () => {
    render(<SlidePanel slides={slides} activeIndex={0} onSelect={vi.fn()} />);
    expect(screen.getByText("01")).toBeTruthy();
    expect(screen.getByText("02")).toBeTruthy();
    // 발화 내용 텍스트는 더 이상 표시하지 않는다.
    expect(screen.queryByText("안녕하세요 중국어 번역 작문 2주차")).toBeNull();
    expect(screen.queryByText("중국어 문장을 살펴보겠습니다")).toBeNull();
  });

  it("renders the slide image thumbnail when imageUrl is provided", () => {
    const { container } = render(
      <SlidePanel slides={slides} activeIndex={0} onSelect={vi.fn()} />,
    );
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img?.getAttribute("src")).toBe("https://cdn.example.com/s/1.png");
  });

  it("labels each slide button by its page number", () => {
    render(<SlidePanel slides={slides} activeIndex={0} onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: /슬라이드 01/ })).toBeTruthy();
    // pending 슬라이드는 'AI 생성 중' 도 라벨에 포함.
    expect(
      screen.getByRole("button", { name: /슬라이드 02 · AI 생성 중/ }),
    ).toBeTruthy();
  });
});
