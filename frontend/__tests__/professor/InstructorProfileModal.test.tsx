import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import type { ReactNode } from "react";
import InstructorProfileModal from "@/components/professor/InstructorProfileModal";
import { I18nProvider } from "@/contexts/I18nContext";
import { ToastProvider } from "@/components/ui/Toast";

// 백엔드 호출 모킹 — PATCH /api/auth/complete-profile 가 아직 없으므로 reject 가 정상.
vi.mock("@/lib/api", () => ({
  api: {
    patch: vi.fn().mockResolvedValue({ data: { ok: true } }),
  },
}));

const renderModal = (ui: ReactNode) =>
  render(
    <I18nProvider>
      <ToastProvider>{ui}</ToastProvider>
    </I18nProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe("InstructorProfileModal", () => {
  it("does not render the form when closed", () => {
    renderModal(
      <InstructorProfileModal
        open={false}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    expect(screen.queryByTestId("professor-profile-form")).toBeNull();
  });

  it("renders all three fields and a submit button when open", () => {
    renderModal(
      <InstructorProfileModal
        open={true}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    expect(screen.getByTestId("professor-profile-school")).toBeTruthy();
    expect(screen.getByTestId("professor-profile-department")).toBeTruthy();
    expect(screen.getByTestId("professor-profile-position")).toBeTruthy();
    expect(screen.getByTestId("professor-profile-submit")).toBeTruthy();
  });

  it("blocks submit and surfaces an error when school or department is empty", () => {
    const onSaved = vi.fn();
    renderModal(
      <InstructorProfileModal
        open={true}
        onClose={() => {}}
        onSaved={onSaved}
      />,
    );
    // 학교만 채우고 학과는 비운 상태에서 제출
    fireEvent.change(screen.getByTestId("professor-profile-school"), {
      target: { value: "경기대학교" },
    });
    fireEvent.submit(screen.getByTestId("professor-profile-form"));
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/필수/);
  });

  it("calls onSaved with trimmed values + closes after PATCH attempt", async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    renderModal(
      <InstructorProfileModal
        open={true}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    fireEvent.change(screen.getByTestId("professor-profile-school"), {
      target: { value: "  경기대학교  " },
    });
    fireEvent.change(screen.getByTestId("professor-profile-department"), {
      target: { value: "중어중문학과" },
    });

    await act(async () => {
      fireEvent.submit(screen.getByTestId("professor-profile-form"));
    });

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onSaved).toHaveBeenCalledWith({
      school: "경기대학교",
      department: "중어중문학과",
      position: undefined,
    });
    expect(onClose).toHaveBeenCalled();
  });
});
