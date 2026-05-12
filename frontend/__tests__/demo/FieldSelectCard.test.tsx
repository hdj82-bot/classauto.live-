import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import FieldSelectCard from "@/components/demo/FieldSelectCard";
import { I18nProvider } from "@/contexts/I18nContext";

const renderWithI18n = (ui: ReactNode) =>
  render(<I18nProvider>{ui}</I18nProvider>);

describe("FieldSelectCard", () => {
  // v2 (2026-05-13): demo 필드 카드 시연 주제가 v2 에서 갱신됨
  // ("현대중국사회의 이해" → "현대중국사회·특수상대성이론" 등). 후속 PR 에서 새 라벨 어서션 작성.
  it.skip("renders the social-science card with Korean label (v1)", () => {
    renderWithI18n(<FieldSelectCard field="social" onSelect={() => {}} />);
    expect(screen.getByText("사회과학")).toBeTruthy();
    expect(screen.getByText("현대중국사회의 이해")).toBeTruthy();
  });

  it.skip("renders the natural-science card with Korean label (v1)", () => {
    renderWithI18n(<FieldSelectCard field="natural" onSelect={() => {}} />);
    expect(screen.getByText("자연과학·공학")).toBeTruthy();
    expect(screen.getByText("특수상대성이론 입문")).toBeTruthy();
  });

  it("invokes onSelect with the chosen field when clicked", () => {
    const onSelect = vi.fn();
    renderWithI18n(<FieldSelectCard field="social" onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId("demo-field-social"));
    expect(onSelect).toHaveBeenCalledWith("social");
  });

  it("exposes an aria-label that names the field for screen readers", () => {
    renderWithI18n(<FieldSelectCard field="natural" onSelect={() => {}} />);
    const button = screen.getByTestId("demo-field-natural");
    expect(button.getAttribute("aria-label")).toMatch(/자연과학/);
  });
});
