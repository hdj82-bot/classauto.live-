import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/contexts/I18nContext";

/**
 * 스펙 15 §4.1 — `/v/[slug]` 진입 시 수강 등록.
 *
 * 회귀 가드 4종(요구사항 그대로):
 *   1. 등록은 **강좌 단위** — 강의 slug 를 보내면 백엔드가 course 로 수렴시킨다.
 *   2. 재진입해도 중복/에러가 없다(멱등).
 *   3. 제적(403)이면 **안내 화면**을 보여준다. 조용히 실패하면 안 된다.
 *   4. 교수자 경로는 깨지지 않는다 — join 은 require_student 라 호출하면 403 이다.
 */

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  join: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  user: null as { role: string } | null,
  authLoading: false,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ slug: "week-3-ba-construction" }),
  useRouter: () => ({
    replace: mocks.replace,
    push: mocks.push,
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/v/week-3-ba-construction",
}));

vi.mock("@/lib/api", () => ({
  api: { get: mocks.get },
  enrollmentApi: { join: mocks.join },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: mocks.user, isLoading: mocks.authLoading }),
}));

import StudentEntryContent from "@/app/v/[slug]/StudentEntryContent";

const LECTURE = {
  id: "lec-1",
  course_id: "course-1",
  title: "把자문 입문",
  description: null,
  thumbnail_url: null,
  slug: "week-3-ba-construction",
  is_expired: false,
  video_url: null,
};

const renderEntry = () =>
  render(
    <I18nProvider>
      <StudentEntryContent />
    </I18nProvider>,
  );

/** axios 형태의 에러 — isAxiosError 가 true 로 판정하도록 플래그를 단다. */
function axiosError(status: number) {
  return Object.assign(new Error(`HTTP ${status}`), {
    isAxiosError: true,
    response: { status },
  });
}

describe("StudentEntryContent — 수강 등록", () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.join.mockReset();
    mocks.replace.mockReset();
    mocks.user = null;
    mocks.authLoading = false;
    mocks.get.mockResolvedValue({ data: LECTURE });
    mocks.join.mockResolvedValue({
      data: {
        id: "e1",
        course_id: "course-1",
        status: "active",
        section: null,
        source: "link",
      },
    });
  });

  it("학생이 들어오면 강의 slug 로 등록한다 — 백엔드가 강좌로 수렴시킨다", async () => {
    mocks.user = { role: "student" };
    renderEntry();

    await waitFor(() =>
      expect(mocks.join).toHaveBeenCalledWith({
        lecture_slug: "week-3-ba-construction",
      }),
    );
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/lecture/week-3-ba-construction"),
    );
  });

  it("이미 등록된 학생이 재진입해도 오류 없이 재생으로 넘어간다(멱등)", async () => {
    mocks.user = { role: "student" };
    // 서버가 기존 등록을 그대로 돌려주는 상황.
    mocks.join.mockResolvedValue({
      data: {
        id: "e1",
        course_id: "course-1",
        status: "active",
        section: null,
        source: "link",
      },
    });

    renderEntry();

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/lecture/week-3-ba-construction"),
    );
    expect(mocks.join).toHaveBeenCalledTimes(1);
  });

  it("제적된 학생에게는 안내 화면을 보여주고 재생으로 넘기지 않는다", async () => {
    mocks.user = { role: "student" };
    mocks.join.mockRejectedValue(axiosError(403));

    renderEntry();

    expect(await screen.findByText("수강이 종료된 강좌입니다")).toBeTruthy();
    // 조용히 재생 화면으로 넘어가면 학생은 영상이 안 나오는 이유를 알 수 없다.
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("교수자에게는 join 을 호출하지 않는다 — 미리보기 경로가 깨지면 안 된다", async () => {
    mocks.user = { role: "professor" };
    renderEntry();

    // 교수자는 진입 카드를 그대로 보고, 등록 호출도 리다이렉트도 없다.
    await screen.findByText(/把자문 입문|강의/);
    expect(mocks.join).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("비로그인 방문자에게는 join 을 호출하지 않는다", async () => {
    mocks.user = null;
    renderEntry();

    await waitFor(() => expect(mocks.get).toHaveBeenCalled());
    expect(mocks.join).not.toHaveBeenCalled();
  });

  it("등록 호출이 네트워크 오류면 재생을 막지 않는다(게이트 꺼진 배포 구간)", async () => {
    mocks.user = { role: "student" };
    mocks.join.mockRejectedValue(axiosError(500));

    renderEntry();

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/lecture/week-3-ba-construction"),
    );
  });
});
