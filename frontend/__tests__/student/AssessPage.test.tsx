import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/contexts/I18nContext";

/**
 * M4: 형성평가 제출은 실제 채점 성공 시에만 "완료" 를 표시해야 한다.
 *  - 빈 응답 → 제출 차단(완료 미표시, 에러 토스트)
 *  - 제출 실패 → 완료 미표시, 에러 토스트
 *  - 정상 채점 → 완료 표시
 */
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  toast: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ slug: "my-lecture" }),
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams("session_id=ls-1"),
}));

vi.mock("@/lib/api", () => ({
  api: { get: mocks.get, post: mocks.post },
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock("@/components/ProtectedRoute", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/student/v2/StudentSurfaceLight", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import AssessmentPage from "@/app/lecture/[slug]/assess/page";

const wrap = (ui: React.ReactNode) => <I18nProvider>{ui}</I18nProvider>;

const SUBMIT_ERROR = "제출에 실패했습니다. 다시 시도해주세요.";
const COMPLETE = "평가 완료!";

function mockQuestionsLoad() {
  mocks.get.mockImplementation((url: string) => {
    if (url.endsWith("/public")) {
      return Promise.resolve({ data: { id: "lec-1" } });
    }
    return Promise.resolve({
      data: {
        questions: [{ id: "q1", content: "1번 문항?", options: ["가", "나"] }],
        session_id: "as-1",
      },
    });
  });
}

describe("AssessmentPage — 성공 시에만 완료 (M4)", () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.post.mockReset();
    mocks.toast.mockReset();
    mocks.push.mockReset();
  });

  it("빈 응답으로 제출하면 완료가 표시되지 않고 에러 토스트만 뜬다", async () => {
    mockQuestionsLoad();
    render(wrap(<AssessmentPage />));

    await screen.findByText("1번 문항?");
    // 답을 선택하지 않고 제출
    fireEvent.click(screen.getByText("제출하기"));

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(SUBMIT_ERROR, "error"),
    );
    expect(mocks.post).not.toHaveBeenCalled();
    expect(screen.queryByText(COMPLETE)).toBeNull();
  });

  it("제출 API 실패 시 완료가 표시되지 않는다", async () => {
    mockQuestionsLoad();
    mocks.post.mockRejectedValue(new Error("500"));
    render(wrap(<AssessmentPage />));

    await screen.findByText("1번 문항?");
    fireEvent.click(screen.getAllByRole("radio")[0]); // 답 선택
    fireEvent.click(screen.getByText("제출하기"));

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(SUBMIT_ERROR, "error"),
    );
    expect(screen.queryByText(COMPLETE)).toBeNull();
  });

  it("정상 채점되면 완료가 표시된다", async () => {
    mockQuestionsLoad();
    mocks.post.mockImplementation((url: string) => {
      if (url === "/api/responses") {
        return Promise.resolve({
          data: [{ question_id: "q1", is_correct: true }],
        });
      }
      return Promise.resolve({ data: {} }); // 세션 complete
    });
    render(wrap(<AssessmentPage />));

    await screen.findByText("1번 문항?");
    fireEvent.click(screen.getAllByRole("radio")[0]);
    fireEvent.click(screen.getByText("제출하기"));

    expect(await screen.findByText(COMPLETE)).toBeTruthy();
    expect(mocks.toast).not.toHaveBeenCalled();
  });
});
