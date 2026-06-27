import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/contexts/I18nContext";

/**
 * L6: Google OAuth 후 추가정보 입력(complete-profile) 완료 시 역할별 착지 검증.
 *  - 교수자 → /professor/dashboard
 *  - 학생   → /dashboard
 */
const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  login: vi.fn(),
  tempExchange: vi.fn(),
  completeProfile: vi.fn(),
  searchParams: new URLSearchParams("temp_code=tc-1"),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mocks.searchParams,
  useRouter: () => ({
    replace: mocks.replace,
    push: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ login: mocks.login }),
}));

vi.mock("@/lib/api", () => ({
  authApi: {
    tempExchange: mocks.tempExchange,
    completeProfile: mocks.completeProfile,
  },
}));

import CompleteProfileContent from "@/app/auth/complete-profile/CompleteProfileContent";

const wrap = (ui: React.ReactNode) => <I18nProvider>{ui}</I18nProvider>;

describe("CompleteProfileContent — 역할별 착지 (L6)", () => {
  beforeEach(() => {
    mocks.replace.mockReset();
    mocks.login.mockReset();
    mocks.tempExchange.mockReset();
    mocks.completeProfile.mockReset();
    mocks.searchParams = new URLSearchParams("temp_code=tc-1");
  });

  it("교수자는 가입 완료 후 /professor/dashboard 로 착지한다", async () => {
    mocks.tempExchange.mockResolvedValue({
      data: {
        temp_token: "tt",
        email: "prof@k.ac.kr",
        name: "하두진",
        role: "professor",
      },
    });
    mocks.completeProfile.mockResolvedValue({ data: { access_token: "jwt-p" } });

    const { container } = render(wrap(<CompleteProfileContent />));

    await waitFor(() =>
      expect(container.querySelector("#cp-school")).toBeTruthy(),
    );
    fireEvent.change(container.querySelector("#cp-school")!, {
      target: { value: "경기대학교" },
    });
    fireEvent.change(container.querySelector("#cp-dept")!, {
      target: { value: "중어중문학과" },
    });
    fireEvent.click(container.querySelector("#cp-consent")!);
    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => {
      expect(mocks.login).toHaveBeenCalledWith("jwt-p");
      expect(mocks.replace).toHaveBeenCalledWith("/professor/dashboard");
    });
  });

  it("학생은 가입 완료 후 /dashboard 로 착지한다", async () => {
    mocks.tempExchange.mockResolvedValue({
      data: {
        temp_token: "tt",
        email: "stud@k.ac.kr",
        name: "학생",
        role: "student",
      },
    });
    mocks.completeProfile.mockResolvedValue({ data: { access_token: "jwt-s" } });

    const { container } = render(wrap(<CompleteProfileContent />));

    await waitFor(() => expect(container.querySelector("#cp-sid")).toBeTruthy());
    fireEvent.change(container.querySelector("#cp-sid")!, {
      target: { value: "20231234" },
    });
    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => {
      expect(mocks.login).toHaveBeenCalledWith("jwt-s");
      expect(mocks.replace).toHaveBeenCalledWith("/dashboard");
    });
  });
});
