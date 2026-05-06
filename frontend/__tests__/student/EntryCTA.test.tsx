import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  startGoogleLogin: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  startGoogleLogin: mocks.startGoogleLogin,
}));

import EntryCTA from "@/components/student/EntryCTA";
import { I18nProvider } from "@/contexts/I18nContext";

const renderCTA = (ui: ReactNode) => render(<I18nProvider>{ui}</I18nProvider>);

describe("EntryCTA", () => {
  beforeEach(() => {
    mocks.startGoogleLogin.mockReset();
  });

  it("renders Google sign-in and signup buttons with the policy notice", () => {
    renderCTA(<EntryCTA />);
    expect(screen.getByText(/Google/)).toBeTruthy();
    expect(screen.getByText(/처음이신가요/)).toBeTruthy();
    expect(screen.getByText(/광고를 사용하지 않으며/)).toBeTruthy();
  });

  it("starts Google login as student when the primary CTA is clicked", () => {
    renderCTA(<EntryCTA />);
    const btn = screen.getByRole("button", { name: /Google/ });
    fireEvent.click(btn);
    expect(mocks.startGoogleLogin).toHaveBeenCalledTimes(1);
    expect(mocks.startGoogleLogin).toHaveBeenCalledWith("student");
  });

  it("uses the provided signupHref so /v/[slug] can route back after signup", () => {
    renderCTA(<EntryCTA signupHref="/auth/signup?next=%2Fv%2Fdemo" />);
    const link = screen.getByText(/처음이신가요/).closest("a");
    expect(link).toBeTruthy();
    expect(link?.getAttribute("href")).toBe("/auth/signup?next=%2Fv%2Fdemo");
  });
});
