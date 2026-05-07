import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import StepIndicator from "@/components/professor/studio/StepIndicator";
import { I18nProvider } from "@/contexts/I18nContext";

const renderWithI18n = (ui: ReactNode) =>
  render(<I18nProvider>{ui}</I18nProvider>);

describe("StepIndicator", () => {
  it("renders all 5 step labels in Korean by default", () => {
    renderWithI18n(<StepIndicator current={1} />);
    expect(screen.getByText(/PPT 업로드/)).toBeTruthy();
    expect(screen.getByText(/스크립트 검토/)).toBeTruthy();
    expect(screen.getByText(/아바타·음성/)).toBeTruthy();
    expect(screen.getByText(/영상 생성/)).toBeTruthy();
    expect(screen.getByText(/공유/)).toBeTruthy();
  });

  it("marks the current step with aria-current=step", () => {
    renderWithI18n(<StepIndicator current={3} />);
    const current = screen.getByText(/아바타·음성/).closest("button");
    expect(current?.getAttribute("aria-current")).toBe("step");
  });

  it("does not call onJump when reviewable=false", () => {
    const onJump = vi.fn();
    renderWithI18n(
      <StepIndicator current={3} reviewable={false} onJump={onJump} />,
    );
    const step1Btn = screen.getByText(/PPT 업로드/).closest("button");
    expect(step1Btn?.hasAttribute("disabled")).toBe(true);
    if (step1Btn) fireEvent.click(step1Btn);
    expect(onJump).not.toHaveBeenCalled();
  });

  it("calls onJump for done steps when reviewable=true", () => {
    const onJump = vi.fn();
    renderWithI18n(
      <StepIndicator current={5} reviewable={true} onJump={onJump} />,
    );
    const step2Btn = screen.getByText(/스크립트 검토/).closest("button");
    expect(step2Btn?.hasAttribute("disabled")).toBe(false);
    if (step2Btn) fireEvent.click(step2Btn);
    expect(onJump).toHaveBeenCalledWith(2);
  });

  it("future steps remain disabled even when reviewable=true", () => {
    const onJump = vi.fn();
    renderWithI18n(
      <StepIndicator current={2} reviewable={true} onJump={onJump} />,
    );
    const step5Btn = screen.getByText(/공유/).closest("button");
    expect(step5Btn?.hasAttribute("disabled")).toBe(true);
  });
});
