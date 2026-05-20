import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FaqAccordion from "@/components/pricing/FaqAccordion";
import { I18nProvider } from "@/contexts/I18nContext";

const wrap = (ui: React.ReactNode) =>
  render(<I18nProvider>{ui}</I18nProvider>);

describe("FaqAccordion", () => {
  it("renders all FAQ items collapsed initially", () => {
    wrap(<FaqAccordion />);
    const items = screen.getAllByTestId(/^pricing-faq-item-\d+$/);
    // 2026 베타 모드: 결제·해지·환불 관련 FAQ 3건을 제거하고 베타 정책 안내
    // 1건을 추가해 총 6 항목. 기존 ≥7 가드는 베타에서 의미를 잃어 ≥6 으로 완화.
    expect(items.length).toBeGreaterThanOrEqual(6);
    // 모든 토글이 aria-expanded=false
    for (let i = 0; i < items.length; i++) {
      const toggle = screen.getByTestId(`pricing-faq-toggle-${i}`);
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
    }
  });

  it("toggles a panel open/closed via the button", () => {
    wrap(<FaqAccordion />);
    const toggle = screen.getByTestId("pricing-faq-toggle-0");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("pricing-faq-panel-0")).toBeTruthy();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("pricing-faq-panel-0")).toBeNull();
  });

  it("includes the two guardrail-required questions (02-guardrails.md §8.1)", () => {
    wrap(<FaqAccordion />);
    // 강의 범위 외 질문 차단 — RAG 0.7 정책
    expect(screen.getByText(/학습 외 질문/)).toBeTruthy();
    // 학생 자리비움 — 인터스티셜 퀴즈
    expect(screen.getByText(/자리를 비우면/)).toBeTruthy();
  });
});
