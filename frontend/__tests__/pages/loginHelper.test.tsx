import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { I18nProvider } from "@/contexts/I18nContext";
import LoginContent from "@/app/auth/login/LoginContent";

const mocks = vi.hoisted(() => ({
  startGoogleLogin: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  startGoogleLogin: mocks.startGoogleLogin,
}));

const wrap = (ui: React.ReactNode) => <I18nProvider>{ui}</I18nProvider>;

describe("LoginContent — startGoogleLogin helper integration", () => {
  beforeEach(() => {
    mocks.startGoogleLogin.mockReset();
  });

  it("calls startGoogleLogin('student') by default — no direct window.location.href", () => {
    render(wrap(<LoginContent />));
    const btn = screen.getByText(/Google 로그인/);
    act(() => {
      fireEvent.click(btn);
    });
    expect(mocks.startGoogleLogin).toHaveBeenCalledTimes(1);
    expect(mocks.startGoogleLogin).toHaveBeenCalledWith("student");
  });

  it("calls startGoogleLogin('professor') after switching role", () => {
    render(wrap(<LoginContent />));
    fireEvent.click(screen.getByText("교수자"));
    fireEvent.click(screen.getByText(/교수자로 Google 로그인/));
    expect(mocks.startGoogleLogin).toHaveBeenCalledWith("professor");
  });
});
