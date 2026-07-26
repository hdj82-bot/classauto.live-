import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/contexts/I18nContext";
import { LectureProvider, useRegisterLecture } from "@/contexts/LectureContext";

/**
 * 피드백 진입점 + 강의 맥락 — 스펙 13 §F · 14 §D.
 *
 * 회귀 가드:
 *   1. 강의 화면에서 누르면 `lecture_id` 가 함께 간다
 *   2. 강의를 모르면 **그래도 제출된다** — 맥락을 못 붙였다고 제보를 막으면 안 된다
 *   3. 화면을 떠나면 등록이 비워진다 — 남으면 다음 제보에 엉뚱한 강의가 붙는다
 */

const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
  user: { role: "professor" } as { role: string } | null,
  pathname: "/lecture/week-1",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useOptionalAuth: () => (mocks.user ? { user: mocks.user } : null),
}));

vi.mock("@/lib/api", () => ({
  feedbackApi: { submit: mocks.submit },
}));

import FeedbackLauncher from "@/components/feedback/FeedbackLauncher";

/** 플레이어가 강의를 받아온 뒤 스스로 등록하는 동작을 흉내낸다. */
function LectureRegistrar({ id, title }: { id?: string; title?: string }) {
  useRegisterLecture(id, title);
  return null;
}

async function submitFeedback(message: string) {
  fireEvent.click(screen.getByRole("button", { name: /피드백|Feedback/i }));
  const textarea = await screen.findByRole("textbox");
  fireEvent.change(textarea, { target: { value: message } });
  const form = textarea.closest("form")!;
  fireEvent.submit(form);
}

describe("FeedbackLauncher — 강의 맥락", () => {
  beforeEach(() => {
    mocks.submit.mockReset();
    mocks.submit.mockResolvedValue({ data: {} });
    mocks.user = { role: "professor" };
    mocks.pathname = "/lecture/week-1";
  });

  it("강의 화면에서 누르면 lecture_id 를 함께 보낸다", async () => {
    render(
      <I18nProvider>
        <LectureProvider>
          <LectureRegistrar id="lec-1" title="1주차 — 어순" />
          <FeedbackLauncher variant="sidebar" />
        </LectureProvider>
      </I18nProvider>,
    );

    await submitFeedback("자막이 밀립니다");

    await waitFor(() =>
      expect(mocks.submit).toHaveBeenCalledWith(
        expect.objectContaining({
          lecture_id: "lec-1",
          page: "/lecture/week-1",
          message: "자막이 밀립니다",
        }),
      ),
    );
  });

  it("강의를 모르면 lecture_id 없이 그대로 제출된다", async () => {
    // provider 자체가 없는 화면(대시보드 등).
    mocks.pathname = "/professor/dashboard";
    render(
      <I18nProvider>
        <FeedbackLauncher variant="sidebar" />
      </I18nProvider>,
    );

    await submitFeedback("학기 필터가 있으면 좋겠습니다");

    await waitFor(() => expect(mocks.submit).toHaveBeenCalled());
    // 맥락을 못 붙였다고 제보를 막으면 베타에서 가장 필요한 신호를 잃는다.
    expect(mocks.submit.mock.calls[0][0].lecture_id).toBeUndefined();
  });

  it("아직 강의를 못 받아왔으면 lecture_id 없이 보낸다", async () => {
    render(
      <I18nProvider>
        <LectureProvider>
          <LectureRegistrar id={undefined} />
          <FeedbackLauncher variant="sidebar" />
        </LectureProvider>
      </I18nProvider>,
    );

    await submitFeedback("로딩 중에 눌렀습니다");
    await waitFor(() => expect(mocks.submit).toHaveBeenCalled());
    expect(mocks.submit.mock.calls[0][0].lecture_id).toBeUndefined();
  });

  it("강의 화면을 떠나면 등록이 비워진다", async () => {
    const { rerender } = render(
      <I18nProvider>
        <LectureProvider>
          <LectureRegistrar id="lec-1" />
          <FeedbackLauncher variant="sidebar" />
        </LectureProvider>
      </I18nProvider>,
    );

    // 플레이어가 사라진다(다른 화면으로 이동).
    rerender(
      <I18nProvider>
        <LectureProvider>
          <FeedbackLauncher variant="sidebar" />
        </LectureProvider>
      </I18nProvider>,
    );

    await submitFeedback("다른 화면에서 낸 제보");
    await waitFor(() => expect(mocks.submit).toHaveBeenCalled());
    // 남겨 두면 엉뚱한 강의가 붙어 운영자가 잘못된 곳을 재현한다.
    expect(mocks.submit.mock.calls[0][0].lecture_id).toBeUndefined();
  });

  it("비로그인에는 버튼 자체가 없다", () => {
    mocks.user = null;
    render(
      <I18nProvider>
        <FeedbackLauncher variant="sidebar" />
      </I18nProvider>,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });
});
