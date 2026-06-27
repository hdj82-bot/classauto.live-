import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import type { ReactNode } from "react";
import OnboardingModal, {
  ONBOARDING_STORAGE_KEY,
} from "@/components/student/OnboardingModal";
import { I18nProvider } from "@/contexts/I18nContext";

const wrap = (ui: ReactNode) => render(<I18nProvider>{ui}</I18nProvider>);

// M2: 온보딩 플래그가 localStorage → 쿠키로 전환됨.
const onboardedCookieSet = () =>
  document.cookie.includes(`${ONBOARDING_STORAGE_KEY}=true`);
const clearOnboardedCookie = () => {
  document.cookie = `${ONBOARDING_STORAGE_KEY}=; path=/; max-age=0`;
};

describe("OnboardingModal", () => {
  beforeEach(() => {
    clearOnboardedCookie();
  });

  it("opens for first-time visitors and persists onboarded=true on Save", () => {
    const onSaved = vi.fn();
    wrap(<OnboardingModal initialName="" onSaved={onSaved} />);

    // Modal should be visible — the heading is rendered.
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();

    // Type a name and save.
    const nameInput = screen.getByLabelText(/어떻게 불러드릴까요/);
    fireEvent.change(nameInput, { target: { value: "어흥" } });
    fireEvent.click(screen.getByText("저장하고 시작"));

    expect(onboardedCookieSet()).toBe(true);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onSaved.mock.calls[0][0].skipped).toBe(false);
    expect(onSaved.mock.calls[0][0].name).toBe("어흥");
    // Modal should disappear after save.
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Skip also persists onboarded=true and reports skipped:true", () => {
    const onSaved = vi.fn();
    wrap(<OnboardingModal onSaved={onSaved} />);

    fireEvent.click(screen.getByText("건너뛰기"));

    expect(onboardedCookieSet()).toBe(true);
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ skipped: true }),
    );
  });

  it("does NOT show again when the onboarded cookie is already set", () => {
    document.cookie = `${ONBOARDING_STORAGE_KEY}=true; path=/`;

    act(() => {
      wrap(<OnboardingModal />);
    });

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
