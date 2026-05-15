import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import type { ReactNode } from "react";

/**
 * SignupWizard 단위 회귀 (후속 정리 ③ — 창4 PR #114 신설 스펙).
 *
 * v2 학생 가입은 06 prototype 기반 3단계 마법사다. SignupContent.test.tsx 는
 * 래퍼 마운트만 가드하고, 단계별 동작은 본 파일이 단위로 검증한다:
 *   - Step1: 학교 이메일 valid/invalid (도메인 화이트리스트 → 보내기 활성화)
 *   - Step2: 인증 메일 60초 resend 카운트다운
 *   - Step3: 추가 정보 입력 → OAuth(role=student) 시작 + sessionStorage stash
 *
 * 실제 메일 발송 백엔드가 없어 마법사는 Google OAuth 로 fallback 한다
 * (SignupWizard 헤더 주석 참조). startGoogleLogin 은 모킹한다.
 */

const mocks = vi.hoisted(() => ({
  startGoogleLogin: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  startGoogleLogin: mocks.startGoogleLogin,
}));

import SignupWizard from "@/components/student/v2/SignupWizard";
import { I18nProvider } from "@/contexts/I18nContext";

const wrap = (ui: ReactNode) => render(<I18nProvider>{ui}</I18nProvider>);

const SESSION_KEY = "ifl_student_signup_hint";

beforeEach(() => {
  mocks.startGoogleLogin.mockReset();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SignupWizard — Step 1 (학교 이메일 valid/invalid)", () => {
  it("keeps the send button disabled and shows the invalid hint for a non-academic email", () => {
    wrap(<SignupWizard />);
    const email = screen.getByLabelText("학교 이메일") as HTMLInputElement;
    const send = screen.getByRole("button", { name: /인증 메일 보내기/ });

    expect((send as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(email, { target: { value: "foo@gmail.com" } });

    expect((send as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/학교 이메일\(\.ac\.kr\)을 입력해주세요/)).toBeTruthy();
    expect(mocks.startGoogleLogin).not.toHaveBeenCalled();
  });

  it("enables sending and shows the matched school for a valid .ac.kr email", () => {
    wrap(<SignupWizard />);
    const email = screen.getByLabelText("학교 이메일") as HTMLInputElement;
    const send = screen.getByRole("button", { name: /인증 메일 보내기/ });

    fireEvent.change(email, { target: { value: "hong@kgu.ac.kr" } });

    expect((send as HTMLButtonElement).disabled).toBe(false);
    // kgu.ac.kr → 경기대학교 (SCHOOL_DOMAINS 매칭)
    expect(screen.getByText(/경기대학교 이메일이 확인됐어요/)).toBeTruthy();
  });
});

describe("SignupWizard — Step 2 (인증 메일 resend 카운트다운)", () => {
  it("advances to Step 2 on send and counts the 60s resend timer down", () => {
    vi.useFakeTimers();
    try {
      wrap(<SignupWizard />);

      fireEvent.change(screen.getByLabelText("학교 이메일"), {
        target: { value: "hong@kgu.ac.kr" },
      });
      fireEvent.click(screen.getByRole("button", { name: /인증 메일 보내기/ }));

      // Step 2 도달 — 메일 발송 안내
      expect(screen.getByText("메일을 보내드렸어요")).toBeTruthy();

      // resend 버튼은 카운트다운 동안 비활성
      const resendBtn = screen.getByRole("button", {
        name: /인증 메일 다시 보내기/,
      }) as HTMLButtonElement;
      expect(resendBtn.disabled).toBe(true);

      // rAF(16ms) 가 setResendSeconds(60) + setInterval 을 시작 → 카운트다운
      act(() => {
        vi.advanceTimersByTime(16);
      });
      act(() => {
        vi.advanceTimersByTime(4000);
      });

      const timer = screen.getByText(/초 뒤 가능/);
      const secs = Number((timer.textContent ?? "").replace(/\D/g, ""));
      expect(secs).toBeGreaterThan(0);
      expect(secs).toBeLessThan(60);
      expect(resendBtn.disabled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("SignupWizard — Step 3 (OAuth start + sessionStorage stash)", () => {
  it("kicks off Google OAuth as student and stashes the signup hint", () => {
    vi.useFakeTimers();
    try {
      wrap(<SignupWizard next="/v/demo-slug" />);

      // Step 1 — 유효 학교 이메일 (경기대) 입력 후 발송
      fireEvent.change(screen.getByLabelText("학교 이메일"), {
        target: { value: "hong@kgu.ac.kr" },
      });
      fireEvent.click(screen.getByRole("button", { name: /인증 메일 보내기/ }));

      // Step 2 — 데모 링크 클릭 시뮬레이션으로 Step 3 진입
      fireEvent.click(
        screen.getByRole("button", { name: "데모: 링크 클릭 시뮬레이션" }),
      );

      // Step 3 — 추가 정보 입력
      expect(screen.getByText("거의 다 됐어요")).toBeTruthy();
      fireEvent.change(
        screen.getByLabelText("이름") as HTMLInputElement,
        { target: { value: "어흥" } },
      );
      fireEvent.change(
        screen.getByLabelText("학번") as HTMLInputElement,
        { target: { value: "20240001" } },
      );
      fireEvent.change(
        screen.getByLabelText("학과 / 전공") as HTMLSelectElement,
        { target: { value: "중어중문학과" } },
      );
      fireEvent.click(screen.getByRole("checkbox"));

      const submit = screen.getByRole("button", {
        name: /가입 완료/,
      }) as HTMLButtonElement;
      expect(submit.disabled).toBe(false);
      fireEvent.click(submit);

      // OAuth 라운드트립은 1.4초 뒤 시작 (UX 토스트 후)
      expect(mocks.startGoogleLogin).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(1400);
      });
      expect(mocks.startGoogleLogin).toHaveBeenCalledWith("student");

      const stash = window.sessionStorage.getItem(SESSION_KEY);
      expect(stash).toBeTruthy();
      const parsed = JSON.parse(stash!);
      expect(parsed.name).toBe("어흥");
      expect(parsed.student_number).toBe("20240001");
      expect(parsed.next).toBe("/v/demo-slug");
      expect(parsed.school).toBe("경기대학교");
      expect(parsed.major).toBe("중어중문학과");
    } finally {
      vi.useRealTimers();
    }
  });
});
