import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import FieldSelectCard from "@/components/demo/FieldSelectCard";
import { I18nProvider } from "@/contexts/I18nContext";

const renderWithI18n = (ui: ReactNode) =>
  render(<I18nProvider>{ui}</I18nProvider>);

describe("FieldSelectCard", () => {
  it("renders the social-science card with Korean label", () => {
    renderWithI18n(<FieldSelectCard field="social" onSelect={() => {}} />);
    expect(screen.getByText("사회과학")).toBeTruthy();
    expect(screen.getByText("현대중국사회의 이해")).toBeTruthy();
  });

  it("renders the natural-science card with Korean label", () => {
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
