import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import WorkArea from "@/components/professor/studio/v2/WorkArea";

describe("WorkArea isLoading", () => {
  it("renders preview spinner, '슬라이드 분석 중' header, placeholder script and disables actions", () => {
    render(
      <WorkArea
        slideNumber={1}
        totalSlides={0}
        slideTitle=""
        aiText=""
        isLoading
      />,
    );

    expect(screen.getByTestId("workarea-preview-loading")).toBeTruthy();
    expect(screen.getByText("스크립트 생성 중…")).toBeTruthy();
    expect(screen.getByTestId("workarea-header-analyzing")).toBeTruthy();
    expect(screen.queryByText(/슬라이드\s*1\s*\/\s*0/)).toBeNull();

    expect(screen.getByTestId("workarea-script-loading")).toBeTruthy();
    expect(
      screen.getByText("AI 가 PPT 노트를 추출하고 있어요…"),
    ).toBeTruthy();

    const editBtn = screen.getByRole("button", { name: /수동 편집/ });
    const regenBtn = screen.getByRole("button", { name: /다시 생성/ });
    expect((editBtn as HTMLButtonElement).disabled).toBe(true);
    expect((regenBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps normal header when isLoading=true but totalSlides>0", () => {
    render(
      <WorkArea
        slideNumber={1}
        totalSlides={5}
        slideTitle="把字句 분석"
        aiText=""
        isLoading
      />,
    );
    expect(screen.queryByTestId("workarea-header-analyzing")).toBeNull();
    expect(screen.getByText(/\/\s*5/)).toBeTruthy();
  });
});

describe("WorkArea broken-image fallback", () => {
  it("falls back to DefaultSlideMock when the slide image errors out", () => {
    render(
      <WorkArea
        slideNumber={2}
        totalSlides={10}
        slideTitle="把字句의 구조"
        aiText="안녕하세요."
        slideImageUrl="https://example.invalid/missing.png"
      />,
    );

    const img = screen.getByAltText("슬라이드 2 미리보기") as HTMLImageElement;
    expect(img).toBeTruthy();

    fireEvent.error(img);

    expect(screen.queryByAltText("슬라이드 2 미리보기")).toBeNull();
    expect(screen.getByText(/Slide\s*2/i)).toBeTruthy();
  });

  it("renders DefaultSlideMock when slideImageUrl is an empty string (no broken <img>)", () => {
    render(
      <WorkArea
        slideNumber={3}
        totalSlides={10}
        slideTitle="시험 슬라이드"
        aiText=""
        slideImageUrl=""
      />,
    );
    expect(screen.queryByAltText("슬라이드 3 미리보기")).toBeNull();
    expect(screen.getByText(/Slide\s*3/i)).toBeTruthy();
  });
});
