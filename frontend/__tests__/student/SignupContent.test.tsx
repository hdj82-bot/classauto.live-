import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  startGoogleLogin: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock("@/lib/auth", () => ({
  startGoogleLogin: mocks.startGoogleLogin,
}));

vi.mock("next/navigation", async () => {
  const actual = await vi.importActual("next/navigation");
  return {
    ...actual,
    useSearchParams: () => mocks.searchParams,
  };
});

import SignupContent from "@/app/auth/signup/SignupContent";
import { I18nProvider } from "@/contexts/I18nContext";

const wrap = (ui: ReactNode) => render(<I18nProvider>{ui}</I18nProvider>);

/**
 * v2 회귀 (후속 정리 ③): SignupContent 는 이제 StudentSurfaceLight 안에
 * SignupWizard 를 마운트하는 얇은 래퍼다. v1 의 단일 폼 어서션(이름·선호 언어·
 * 학번 인풋, "Google 계정으로 가입" 버튼)은 전부 무효 → 래퍼가 라이트 surface +
 * 마법사 Step1 을 올바로 마운트하는지만 가드한다. 마법사 단계별 동작
 * (Step1 valid/invalid · Step2 resend · Step3 OAuth+stash)은
 * SignupWizard.test.tsx 에서 단위로 검증한다.
 */
describe("SignupContent (v2 — StudentSurfaceLight + SignupWizard 래퍼)", () => {
  beforeEach(() => {
    mocks.startGoogleLogin.mockReset();
    mocks.searchParams = new URLSearchParams();
    window.sessionStorage.clear();
  });

  it("mounts the light student surface (brand bar) and the wizard Step 1", () => {
    wrap(<SignupContent />);
    // StudentSurfaceLight 브랜드바
    expect(screen.getByText("ClassAuto")).toBeTruthy();
    // SignupWizard Step 1 — 학교 이메일 입력 (label↔input 연결)
    const email = screen.getByLabelText("학교 이메일") as HTMLInputElement;
    expect(email).toBeTruthy();
    expect(email.type).toBe("email");
    // 3단계 마법사 진행 표시가 Step 1 에서 시작
    const progress = screen.getByRole("progressbar");
    expect(progress.getAttribute("aria-valuenow")).toBe("1");
    expect(progress.getAttribute("aria-valuemax")).toBe("3");
    // 마운트만으로 OAuth 가 시작되면 안 된다
    expect(mocks.startGoogleLogin).not.toHaveBeenCalled();
  });

  it("starts on Step 1 with the send button disabled until a valid academic email", () => {
    wrap(<SignupContent />);
    const send = screen.getByRole("button", { name: /인증 메일 보내기/ });
    expect((send as HTMLButtonElement).disabled).toBe(true);
  });
});
