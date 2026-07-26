import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/contexts/I18nContext";

/**
 * 운영자 피드백 인박스 — 강의 맥락 표시 (스펙 14 §D).
 *
 * 회귀 가드:
 *   1. 강의 **제목**을 보여준다 — UUID 만으로는 운영자가 어느 강의인지 모른다
 *   2. 강의를 누르면 제보자 화면(`/admin/testers/{user_id}`)으로 간다
 *   3. 강의 없는 제보도 그대로 렌더된다
 */

const mocks = vi.hoisted(() => ({ adminList: vi.fn(), adminSetStatus: vi.fn() }));

vi.mock("@/lib/api", () => ({
  feedbackApi: {
    adminList: mocks.adminList,
    adminSetStatus: mocks.adminSetStatus,
  },
}));

import AdminFeedbackPage from "@/app/admin/feedback/page";

const ITEM = {
  id: "fb-1",
  user_id: "user-9",
  user_email: "prof@kgu.ac.kr",
  role: "professor",
  category: "bug",
  message: "자막이 밀립니다",
  lecture_id: "lec-1",
  lecture_title: "3주차 — 把자문",
  page: "/lecture/week-3",
  status: "open" as const,
  created_at: "2026-07-20T02:00:00Z",
};

const renderPage = () =>
  render(
    <I18nProvider>
      <AdminFeedbackPage />
    </I18nProvider>,
  );

describe("AdminFeedbackPage — 강의 맥락", () => {
  beforeEach(() => {
    mocks.adminList.mockReset();
    mocks.adminSetStatus.mockReset();
    mocks.adminList.mockResolvedValue({ data: { feedback: [ITEM] } });
  });

  it("강의 제목과 라우트를 함께 보여준다", async () => {
    renderPage();
    // UUID 만 보여주면 운영자는 여전히 어느 강의인지 모른다.
    expect(await screen.findByText("3주차 — 把자문")).toBeTruthy();
    expect(screen.getByText(/\/lecture\/week-3/)).toBeTruthy();
  });

  it("강의를 누르면 제보자 화면으로 간다", async () => {
    renderPage();
    const link = await screen.findByTestId("feedback-lecture-fb-1");
    expect(link.getAttribute("href")).toBe("/admin/testers/user-9");
  });

  it("강의가 삭제됐으면 그 사실을 쓴다", async () => {
    mocks.adminList.mockResolvedValue({
      data: { feedback: [{ ...ITEM, lecture_title: null }] },
    });
    renderPage();
    // 빈칸으로 두면 "맥락이 원래 없었다"와 구분되지 않는다.
    expect(await screen.findByText("(삭제된 강의)")).toBeTruthy();
  });

  it("유저가 삭제됐으면 링크 대신 텍스트로 남긴다", async () => {
    mocks.adminList.mockResolvedValue({
      data: { feedback: [{ ...ITEM, user_id: null }] },
    });
    renderPage();
    await screen.findByText("3주차 — 把자문");
    expect(screen.queryByTestId("feedback-lecture-fb-1")).toBeNull();
  });

  it("강의 없는 제보도 그대로 렌더된다", async () => {
    mocks.adminList.mockResolvedValue({
      data: { feedback: [{ ...ITEM, lecture_id: null, lecture_title: null }] },
    });
    renderPage();
    expect(await screen.findByText("자막이 밀립니다")).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByTestId("feedback-lecture-fb-1")).toBeNull(),
    );
  });
});
