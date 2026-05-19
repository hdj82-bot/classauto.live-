import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import LoginContent from "@/app/auth/login/LoginContent";
import { I18nProvider } from "@/contexts/I18nContext";

// useSearchParams mock
vi.mock("next/navigation", async () => {
  const actual = await vi.importActual("next/navigation");
  return {
    ...actual,
    useSearchParams: () => new URLSearchParams(),
  };
});

const renderWithI18n = (ui: ReactNode) => render(<I18nProvider>{ui}</I18nProvider>);

describe("LoginContent", () => {
  it("renders login page title", () => {
    renderWithI18n(<LoginContent />);
    // v2: IFL 정체성 폐기 → ClassAuto 환영 카피 (2026-05-18).
    expect(screen.getByText("다시 오신 걸 환영합니다")).toBeTruthy();
  });

  it("renders role selection buttons", () => {
    renderWithI18n(<LoginContent />);
    expect(screen.getByText("학습자")).toBeTruthy();
    expect(screen.getByText("교수자")).toBeTruthy();
  });

  // v2 (2026-05-19): Google 버튼 문구에서 역할 고정 제거 ("Google 로그인").
  // 선택 역할은 RoleButton 의 aria-pressed 로만 드러난다.
  it("defaults to student role", () => {
    renderWithI18n(<LoginContent />);
    const studentBtn = screen.getByText("학습자").closest("button");
    expect(studentBtn?.getAttribute("aria-pressed")).toBe("true");
  });

  it("switches to professor role on click", () => {
    renderWithI18n(<LoginContent />);
    fireEvent.click(screen.getByText("교수자"));
    const professorBtn = screen.getByText("교수자").closest("button");
    expect(professorBtn?.getAttribute("aria-pressed")).toBe("true");
  });

  it("renders Google login button", () => {
    renderWithI18n(<LoginContent />);
    const button = screen.getByText(/Google 로그인/);
    expect(button).toBeTruthy();
  });

  it("shows terms and privacy links", () => {
    renderWithI18n(<LoginContent />);
    expect(screen.getByText("이용약관")).toBeTruthy();
    expect(screen.getByText("개인정보처리방침")).toBeTruthy();
  });
});
