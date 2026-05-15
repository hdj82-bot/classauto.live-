import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { ReactNode } from "react";
import FieldSelectCard from "@/components/demo/FieldSelectCard";
import { I18nProvider } from "@/contexts/I18nContext";

const renderWithI18n = (ui: ReactNode) =>
  render(<I18nProvider>{ui}</I18nProvider>);

describe("FieldSelectCard", () => {
  // v2 회귀 (후속 정리 ③): v1 카드의 한글 분야 라벨("사회과학"/"자연과학·공학")
  // + v1 강의명은 v3 라이트 카드로 재작성되며 사라졌다. v3 는 분야 태그
  // (A·Liberal Arts / B·Natural Science) + 강의 제목(중국어문법의 이해 /
  // 광합성의 원리) 구조다. DEPLOYMENT_PROGRESS 의 분야 매핑(社會科學/把자문,
  // 自然科學/광합성) 과 일치 — social=인문계열(중국어문법), natural=자연계열(광합성).
  it("renders the humanities (social) card with its v2 lecture title + tag", () => {
    renderWithI18n(<FieldSelectCard field="social" onSelect={() => {}} />);
    const card = screen.getByTestId("demo-field-social");
    expect(card.getAttribute("data-field")).toBe("social");
    expect(within(card).getByText("중국어문법의 이해")).toBeTruthy();
    expect(within(card).getByText("A · Liberal Arts")).toBeTruthy();
    // v1 라벨은 회귀하지 않아야 한다
    expect(within(card).queryByText("사회과학")).toBeNull();
  });

  it("renders the natural-science card with its v2 lecture title + tag", () => {
    renderWithI18n(<FieldSelectCard field="natural" onSelect={() => {}} />);
    const card = screen.getByTestId("demo-field-natural");
    expect(card.getAttribute("data-field")).toBe("natural");
    expect(within(card).getByText("광합성의 원리")).toBeTruthy();
    expect(within(card).getByText("B · Natural Science")).toBeTruthy();
    expect(within(card).queryByText("자연과학·공학")).toBeNull();
  });

  it("invokes onSelect with the chosen field when clicked", () => {
    const onSelect = vi.fn();
    renderWithI18n(<FieldSelectCard field="social" onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId("demo-field-social"));
    expect(onSelect).toHaveBeenCalledWith("social");
  });

  it("exposes an aria-label that names the field for screen readers", () => {
    // 2026-05-13: a11y 라벨이 분야명(자연계열) + 강의명(광합성) 까지 포함하도록
    // 갱신됨 (v1: '자연과학' → v3: '자연계열 — 광합성의 원리'). 두 표현 중
    // 하나라도 매칭되면 통과하도록 분야 식별 키워드만 검증.
    renderWithI18n(<FieldSelectCard field="natural" onSelect={() => {}} />);
    const button = screen.getByTestId("demo-field-natural");
    expect(button.getAttribute("aria-label")).toMatch(/자연계열|광합성/);
  });
});
