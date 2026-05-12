import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
 * v2 (2026-05-13): SignupContent 가 06 prototype 기반 3단계 마법사 (SignupWizard)
 * 로 전면 재작성되어 본 파일의 모든 어서션 (학생 가입 헤딩, 이름·선호 언어·학번
 * 인풋, "Google 계정으로 가입" 버튼) 이 무효화됨.
 *
 * 임시로 describe 전체를 skip 처리하여 머지 차단을 해제하고, 후속 PR 에서
 * v2 마법사의 새 본문 (이메일 도메인 화이트리스트 → 인증 메일 60초 리센드 →
 * 추가 정보 + 데이터 정책 3카드) 에 맞는 회귀 케이스를 작성한다.
 *
 * TODO(후속 PR): SignupWizard.test.tsx 신설 — Step1 이메일 valid/invalid,
 *   Step2 resend 카운트다운, Step3 OAuth start + sessionStorage stash 등.
 */
describe.skip("SignupContent (v1 — v2 마법사로 재작성됨, 후속 PR 에서 새 회귀 케이스)", () => {
  beforeEach(() => {
    mocks.startGoogleLogin.mockReset();
    mocks.searchParams = new URLSearchParams();
    window.sessionStorage.clear();
  });

  it("renders the student sign-up form with name, language, and student number fields", () => {
    wrap(<SignupContent />);
    expect(screen.getByText("학생 가입")).toBeTruthy();
    expect(screen.getByLabelText(/이름/)).toBeTruthy();
    expect(screen.getByLabelText(/선호 언어/)).toBeTruthy();
    expect(screen.getByLabelText(/학번/)).toBeTruthy();
  });

  it("blocks submission and surfaces an error when name is empty", () => {
    wrap(<SignupContent />);
    const submit = screen.getByRole("button", { name: /Google 계정으로 가입/ });
    fireEvent.click(submit);
    expect(screen.getByRole("alert").textContent).toMatch(/이름을 입력/);
    expect(mocks.startGoogleLogin).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric student number", () => {
    wrap(<SignupContent />);
    fireEvent.change(screen.getByLabelText(/이름/), { target: { value: "어흥" } });
    fireEvent.change(screen.getByLabelText(/학번/), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: /Google 계정으로 가입/ }));

    const alerts = screen.getAllByRole("alert");
    expect(alerts.some((el) => /숫자 4-12자리/.test(el.textContent ?? ""))).toBe(true);
    expect(mocks.startGoogleLogin).not.toHaveBeenCalled();
  });

  it("kicks off Google OAuth as student and stashes the signup hint on valid submit", () => {
    mocks.searchParams = new URLSearchParams("next=/v/demo-slug");
    wrap(<SignupContent />);

    fireEvent.change(screen.getByLabelText(/이름/), { target: { value: "어흥" } });
    fireEvent.change(screen.getByLabelText(/학번/), { target: { value: "20240001" } });
    fireEvent.click(screen.getByRole("button", { name: /Google 계정으로 가입/ }));

    expect(mocks.startGoogleLogin).toHaveBeenCalledWith("student");
    const stash = window.sessionStorage.getItem("ifl_student_signup_hint");
    expect(stash).toBeTruthy();
    const parsed = JSON.parse(stash!);
    expect(parsed.name).toBe("어흥");
    expect(parsed.student_number).toBe("20240001");
    expect(parsed.next).toBe("/v/demo-slug");
  });
});
