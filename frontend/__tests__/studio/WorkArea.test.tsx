import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import WorkArea from "@/components/professor/studio/v2/WorkArea";

/**
 * WorkArea — preview body 영역의 슬라이드 이미지 / fallback mock 분기를 검증.
 *
 * 컨트랙트:
 *   - slideImageUrl 이 있으면 <img alt="슬라이드 N 미리보기"> 한 장만 렌더한다
 *     (next/image 대신 <img> 직사용 — S3 외부 도메인 next.config 등록 회피).
 *   - 없으면 DefaultSlideMock 이 fallback 으로 보인다 ("AI 가 분석한 슬라이드
 *     미리보기" 안내문 + Slide N 배지).
 */
describe("WorkArea — slide preview image", () => {
  const baseProps = {
    slideNumber: 1,
    totalSlides: 3,
    slideTitle: "把자문 구조의 이해",
    aiText: "안녕하세요. 첫 번째 슬라이드 발화입니다.",
  } as const;

  it("renders the slide image when slideImageUrl is provided", () => {
    render(
      <WorkArea
        {...baseProps}
        slideImageUrl="https://cdn.example.com/slides/lec-1/1.png"
      />,
    );

    const img = screen.getByAltText("슬라이드 1 미리보기") as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.tagName).toBe("IMG");
    expect(img.getAttribute("src")).toBe(
      "https://cdn.example.com/slides/lec-1/1.png",
    );

    // fallback DefaultSlideMock 텍스트는 노출되지 않아야 함.
    expect(screen.queryByText(/AI 가 분석한 슬라이드 미리보기/)).toBeNull();
  });

  it("falls back to DefaultSlideMock when slideImageUrl is null", () => {
    render(<WorkArea {...baseProps} slideImageUrl={null} />);

    expect(screen.queryByAltText(/슬라이드 1 미리보기/)).toBeNull();
    expect(screen.getByText(/AI 가 분석한 슬라이드 미리보기/)).toBeTruthy();
    // SLIDE N 배지가 mock 안에 있는지도 확인.
    expect(screen.getByText(/Slide 1/)).toBeTruthy();
  });

  it("falls back to DefaultSlideMock when slideImageUrl is omitted", () => {
    render(<WorkArea {...baseProps} />);

    expect(screen.queryByAltText(/슬라이드 1 미리보기/)).toBeNull();
    expect(screen.getByText(/AI 가 분석한 슬라이드 미리보기/)).toBeTruthy();
  });

  it("uses the current slideNumber in the image alt text", () => {
    render(
      <WorkArea
        {...baseProps}
        slideNumber={7}
        slideImageUrl="https://cdn.example.com/slides/lec-1/7.png"
      />,
    );
    expect(screen.getByAltText("슬라이드 7 미리보기")).toBeTruthy();
  });
});
