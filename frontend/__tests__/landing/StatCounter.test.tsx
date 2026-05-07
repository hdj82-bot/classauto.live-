import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import StatCounter from "@/components/landing/StatCounter";
import { I18nProvider } from "@/contexts/I18nContext";

const renderWithI18n = (ui: ReactNode) =>
  render(<I18nProvider>{ui}</I18nProvider>);

describe("StatCounter", () => {
  it("immediate=true 일 때 target 값을 즉시 표시 (천 단위 구분 포함)", () => {
    renderWithI18n(
      <StatCounter target={12000} suffix="h" label="prep saved" immediate />,
    );
    expect(screen.getByText("12,000")).toBeTruthy();
    expect(screen.getByText("h")).toBeTruthy();
    expect(screen.getByText("prep saved")).toBeTruthy();
  });

  it("groupDigits=false 시 천 단위 구분 없이 표시", () => {
    renderWithI18n(
      <StatCounter
        target={1000}
        label="x"
        immediate
        groupDigits={false}
      />,
    );
    expect(screen.getByText("1000")).toBeTruthy();
  });

  it("aria-live=polite 로 카운트업 진행을 스크린리더가 인지 가능", () => {
    renderWithI18n(<StatCounter target={42} label="x" immediate />);
    const live = screen.getByText("42").closest("[aria-live]");
    expect(live?.getAttribute("aria-live")).toBe("polite");
  });

  it("suffix 가 없으면 숫자 옆에 빈 span 이 추가되지 않음", () => {
    const { container } = renderWithI18n(
      <StatCounter target={5} label="x" immediate />,
    );
    // suffix 미지정 시 별도 span 미렌더
    const numberCell = container.querySelector(".tabular-nums");
    expect(numberCell?.querySelector("span")).toBeNull();
  });
});
