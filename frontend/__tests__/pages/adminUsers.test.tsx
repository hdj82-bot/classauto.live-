import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { I18nProvider } from "@/contexts/I18nContext";
import { ToastProvider } from "@/components/ui/Toast";
import AdminUsersPage from "@/app/admin/users/page";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    get: mocks.get,
    patch: mocks.patch,
  },
}));

const wrap = (ui: React.ReactNode) => (
  <I18nProvider>
    <ToastProvider>{ui}</ToastProvider>
  </I18nProvider>
);

const SAMPLE = {
  total: 1,
  users: [
    {
      id: "u1",
      email: "a@b.c",
      name: "홍길동",
      role: "student",
      school: "K",
      department: "CS",
      is_active: true,
      created_at: null,
    },
  ],
};

describe("AdminUsersPage", () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.patch.mockReset();
    mocks.get.mockResolvedValue({ data: SAMPLE });
  });

  it("renders i18n keys (no hardcoded Korean labels)", async () => {
    render(wrap(<AdminUsersPage />));
    await waitFor(() => screen.getByText("a@b.c"));
    // 한국어 locale 기본값 — 키 fallback (key 자체) 가 아니라 번역값이 떠야 한다.
    expect(screen.getByText("사용자 관리")).toBeTruthy();
    expect(screen.getByText("이름")).toBeTruthy();
    expect(screen.getByText("이메일")).toBeTruthy();
  });

  it("shows error toast (no alert) when role change fails", async () => {
    mocks.patch.mockRejectedValueOnce(new Error("nope"));
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    render(wrap(<AdminUsersPage />));
    await waitFor(() => screen.getByText("a@b.c"));

    const roleSelect = screen.getByLabelText("역할", { selector: `#role-u1` }) as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(roleSelect, { target: { value: "professor" } });
    });

    await waitFor(() => {
      expect(screen.getByText("역할 변경에 실패했습니다.")).toBeTruthy();
    });
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it("shows success toast on successful active toggle", async () => {
    mocks.patch.mockResolvedValueOnce({ data: {} });
    render(wrap(<AdminUsersPage />));
    await waitFor(() => screen.getByText("a@b.c"));

    const btn = screen.getByText("비활성화");
    await act(async () => {
      fireEvent.click(btn);
    });

    await waitFor(() => {
      expect(screen.getByText("상태가 변경되었습니다.")).toBeTruthy();
    });
  });
});
