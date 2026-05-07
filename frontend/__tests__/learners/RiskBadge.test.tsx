import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import RiskBadge from "@/components/professor/learners/RiskBadge";
import { I18nProvider } from "@/contexts/I18nContext";

const wrap = (ui: React.ReactNode) =>
  render(<I18nProvider>{ui}</I18nProvider>);

describe("RiskBadge", () => {
  it("renders ko label for high risk", () => {
    wrap(<RiskBadge level="high" />);
    expect(screen.getByTestId("learner-risk-high")).toBeTruthy();
    expect(screen.getByText("고위험")).toBeTruthy();
  });

  it("renders for completed level", () => {
    wrap(<RiskBadge level="completed" />);
    expect(screen.getByTestId("learner-risk-completed")).toBeTruthy();
    expect(screen.getByText("완료")).toBeTruthy();
  });

  it("compact mode hides the text label but keeps aria-label", () => {
    wrap(<RiskBadge level="medium" compact />);
    const node = screen.getByTestId("learner-risk-medium");
    expect(node.getAttribute("aria-label")).toBe("주의");
    // 라벨 텍스트 자체는 노출되지 않아야 한다
    expect(screen.queryByText("주의", { selector: "span" })).toBeNull();
  });

  it("includes a tooltip explaining the threshold", () => {
    wrap(<RiskBadge level="high" />);
    const node = screen.getByTestId("learner-risk-high");
    expect(node.getAttribute("title")).toContain("진행률");
  });
});
