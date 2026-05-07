import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/contexts/I18nContext";
import HelpContent from "@/components/help/HelpContent";

const wrap = (ui: React.ReactNode) => <I18nProvider>{ui}</I18nProvider>;

describe("HelpContent", () => {
  it("renders the hero, search box, and 6 category cards by default", () => {
    render(wrap(<HelpContent />));
    // 검색 박스
    expect(screen.getByLabelText("도움말 검색")).toBeTruthy();
    // 6 카테고리 모두 렌더 (제목 노출)
    expect(screen.getByText("시작하기")).toBeTruthy();
    expect(screen.getByText("영상 제작")).toBeTruthy();
    expect(screen.getByText("학생 관리")).toBeTruthy();
    expect(screen.getByText("결제·구독")).toBeTruthy();
    expect(screen.getByText("보안·데이터")).toBeTruthy();
    expect(screen.getByText("문제 해결")).toBeTruthy();
  });

  it("switches to category detail when a category card is clicked", () => {
    render(wrap(<HelpContent />));
    fireEvent.click(screen.getByText("결제·구독"));
    // 뒤로가기 텍스트가 노출 (← 전체 카테고리)
    expect(screen.getByText(/전체 카테고리/)).toBeTruthy();
    // 결제 카테고리의 첫 FAQ 질문이 노출
    expect(screen.getByText(/베타 기간에도 결제가 발생하나요/)).toBeTruthy();
  });

  it("returns to grid when the back link is clicked", () => {
    render(wrap(<HelpContent />));
    fireEvent.click(screen.getByText("결제·구독"));
    fireEvent.click(screen.getByText(/전체 카테고리/));
    // 다시 6 카테고리 그리드가 노출
    expect(screen.getByText("시작하기")).toBeTruthy();
    expect(screen.getByText("문제 해결")).toBeTruthy();
  });

  it("activates search and shows results when typing in the search box", async () => {
    render(wrap(<HelpContent />));
    const input = screen.getByLabelText("도움말 검색") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "PPT" } });

    // useDeferredValue 가 다음 frame 에 결과를 반영 — waitFor 로 대기
    await waitFor(() => {
      expect(screen.getByTestId("help-search-results")).toBeTruthy();
    });
    // PPT 키워드로 매칭된 항목이 적어도 1개
    const list = screen.getByTestId("help-search-results");
    expect(list.querySelectorAll("[data-testid^='help-search-hit-']").length)
      .toBeGreaterThan(0);
  });

  it("shows the 'no results' fallback for unmatched queries", async () => {
    render(wrap(<HelpContent />));
    const input = screen.getByLabelText("도움말 검색") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "양자컴퓨팅" } });
    await waitFor(() => {
      expect(screen.getByText("일치하는 항목이 없습니다.")).toBeTruthy();
    });
  });
});
