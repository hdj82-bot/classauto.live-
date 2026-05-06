import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import OnboardingChecklist from "@/components/professor/OnboardingChecklist";
import {
  computeOnboardingProgress,
  type OnboardingSignals,
} from "@/components/professor/onboardingSteps";
import { I18nProvider } from "@/contexts/I18nContext";

const renderWithI18n = (ui: ReactNode) =>
  render(<I18nProvider>{ui}</I18nProvider>);

const signals = (overrides: Partial<OnboardingSignals> = {}): OnboardingSignals => ({
  profileSaved: false,
  courseCount: 0,
  lectureCount: 0,
  lectureWithRenderCount: 0,
  publishedLectureCount: 0,
  ...overrides,
});

describe("OnboardingChecklist", () => {
  it("renders all 5 steps with the first one marked active and progress 0/5", () => {
    const progress = computeOnboardingProgress(signals());
    renderWithI18n(
      <OnboardingChecklist progress={progress} onStepAction={() => {}} />,
    );

    for (const id of ["profile", "course", "upload", "script", "share"]) {
      expect(screen.getByTestId(`professor-onboarding-step-${id}`)).toBeTruthy();
    }
    expect(
      screen
        .getByTestId("professor-onboarding-step-profile")
        .getAttribute("data-status"),
    ).toBe("active");
    expect(
      screen.getByTestId("professor-checklist-progress").textContent,
    ).toMatch(/0/);
  });

  it("marks completed steps with data-status=done and hides their CTA", () => {
    const progress = computeOnboardingProgress(
      signals({ profileSaved: true, courseCount: 1 }),
    );
    renderWithI18n(
      <OnboardingChecklist progress={progress} onStepAction={() => {}} />,
    );

    expect(
      screen
        .getByTestId("professor-onboarding-step-profile")
        .getAttribute("data-status"),
    ).toBe("done");
    expect(
      screen
        .getByTestId("professor-onboarding-step-course")
        .getAttribute("data-status"),
    ).toBe("done");
    // upload 가 next active
    expect(
      screen
        .getByTestId("professor-onboarding-step-upload")
        .getAttribute("data-status"),
    ).toBe("active");

    // 완료 단계의 CTA 는 사라져 있다
    expect(
      screen.queryByTestId("professor-onboarding-cta-profile"),
    ).toBeNull();
  });

  it("forwards step CTA clicks to onStepAction with the right step id", () => {
    const progress = computeOnboardingProgress(signals());
    const onStepAction = vi.fn();
    renderWithI18n(
      <OnboardingChecklist progress={progress} onStepAction={onStepAction} />,
    );
    fireEvent.click(screen.getByTestId("professor-onboarding-cta-profile"));
    expect(onStepAction).toHaveBeenCalledWith("profile");
  });

  it("shows the all-done celebration banner only when nextStep is null", () => {
    const incomplete = computeOnboardingProgress(signals({ profileSaved: true }));
    const { rerender } = renderWithI18n(
      <OnboardingChecklist progress={incomplete} onStepAction={() => {}} />,
    );
    expect(screen.queryByTestId("professor-onboarding-complete")).toBeNull();

    const allDone = computeOnboardingProgress(
      signals({
        profileSaved: true,
        courseCount: 1,
        lectureCount: 1,
        lectureWithRenderCount: 1,
        publishedLectureCount: 1,
      }),
    );
    rerender(
      <I18nProvider>
        <OnboardingChecklist progress={allDone} onStepAction={() => {}} />
      </I18nProvider>,
    );
    expect(screen.getByTestId("professor-onboarding-complete")).toBeTruthy();
  });
});
