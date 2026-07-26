import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/contexts/I18nContext";

/**
 * `/c/[slug]` 강좌 단위 학생 진입 — 스펙 15 2단계.
 *
 * `/v/[slug]`(강의 단위)와 달리 **머무는 화면**이다. 학기 초 QR 1회로 등록하면 이후
 * 발행되는 강의가 이 목록에 자동으로 나타난다(§1.1 — 매주 링크를 다시 뿌리지 않는다).
 *
 * 회귀 가드:
 *   1. 로그인 학생은 자동 등록되고, 재진입해도 중복 호출이 없다(멱등)
 *   2. 제적(403)이면 **안내 화면** — 조용히 목록을 보여주면 안 된다
 *   3. 교수자에게는 join 을 호출하지 않는다(require_student 라 403)
 *   4. 만료 강의는 숨기지 않고 표시만 한다
 */

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  join: vi.fn(),
  push: vi.fn(),
  startGoogleLogin: vi.fn(),
  user: null as { role: string } | null,
  authLoading: false,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ slug: "chinese-grammar-a1b2c3d4" }),
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/c/chinese-grammar-a1b2c3d4",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api", () => ({
  api: { get: mocks.get },
  enrollmentApi: { join: mocks.join },
}));

vi.mock("@/lib/auth", () => ({
  startGoogleLogin: mocks.startGoogleLogin,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: mocks.user, isLoading: mocks.authLoading }),
}));

import CourseEntryContent from "@/app/c/[slug]/CourseEntryContent";

const COURSE = {
  id: "course-1",
  slug: "chinese-grammar-a1b2c3d4",
  title: "중국어문법의 이해",
  description: "把자문을 중심으로",
  term: "2026-2",
  instructor_name: "하두진",
  lecture_count: 2,
  is_expired: false,
  lectures: [
    {
      id: "l1",
      slug: "week-1",
      title: "1주차 — 어순",
      description: null,
      thumbnail_url: null,
      order: 1,
      is_expired: false,
    },
    {
      id: "l2",
      slug: "week-2",
      title: "2주차 — 把자문",
      description: null,
      thumbnail_url: null,
      order: 2,
      is_expired: true,
    },
  ],
};

function axiosError(status: number) {
  return Object.assign(new Error(`HTTP ${status}`), {
    isAxiosError: true,
    response: { status },
  });
}

const renderPage = () =>
  render(
    <I18nProvider>
      <CourseEntryContent />
    </I18nProvider>,
  );

describe("CourseEntryContent — /c/[slug]", () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.join.mockReset();
    mocks.push.mockReset();
    mocks.startGoogleLogin.mockReset();
    mocks.user = null;
    mocks.authLoading = false;
    mocks.get.mockResolvedValue({ data: COURSE });
    mocks.join.mockResolvedValue({
      data: { id: "e1", course_id: "course-1", status: "active", section: null, source: "link" },
    });
  });

  it("로그인 전에도 강좌 정보를 보여준다", async () => {
    renderPage();
    // 무슨 강좌인지 보고 판단할 수 있어야 한다.
    expect(await screen.findByText("중국어문법의 이해")).toBeTruthy();
    expect(screen.getByText("2026-2")).toBeTruthy();
    expect(screen.getByText("하두진")).toBeTruthy();
    // 비로그인에는 등록을 시도하지 않는다.
    expect(mocks.join).not.toHaveBeenCalled();
  });

  it("학생이 들어오면 강좌 slug 로 자동 등록한다", async () => {
    mocks.user = { role: "student" };
    renderPage();

    await waitFor(() =>
      expect(mocks.join).toHaveBeenCalledWith({
        course_slug: "chinese-grammar-a1b2c3d4",
      }),
    );
    // 목록에 머문다 — /v/[slug] 처럼 자동으로 넘기지 않는다.
    expect(await screen.findByText("1주차 — 어순")).toBeTruthy();
  });

  it("등록 호출은 slug 당 한 번만 나간다(멱등)", async () => {
    mocks.user = { role: "student" };
    renderPage();

    await waitFor(() => expect(mocks.join).toHaveBeenCalled());
    expect(mocks.join).toHaveBeenCalledTimes(1);
  });

  it("제적된 학생에게는 안내 화면을 보여준다", async () => {
    mocks.user = { role: "student" };
    mocks.join.mockRejectedValue(axiosError(403));
    renderPage();

    expect(await screen.findByText("수강이 종료된 강좌입니다")).toBeTruthy();
    // 조용히 목록을 보여주면 학생은 왜 안 되는지 알 수 없다.
    expect(screen.queryByText("1주차 — 어순")).toBeNull();
  });

  it("교수자에게는 join 을 호출하지 않는다", async () => {
    mocks.user = { role: "professor" };
    renderPage();

    await screen.findByText("중국어문법의 이해");
    expect(mocks.join).not.toHaveBeenCalled();
  });

  it("등록이 네트워크 오류여도 목록은 막지 않는다", async () => {
    mocks.user = { role: "student" };
    mocks.join.mockRejectedValue(axiosError(500));
    renderPage();

    expect(await screen.findByText("1주차 — 어순")).toBeTruthy();
  });

  it("만료 강의는 숨기지 않고 표시만 한다", async () => {
    mocks.user = { role: "student" };
    renderPage();

    // 사라지면 "내 강의가 없어졌다"고 문의한다.
    expect(await screen.findByText("2주차 — 把자문")).toBeTruthy();
    expect(screen.getByText("시청 기간이 끝났습니다")).toBeTruthy();

    // 살아 있는 강의만 링크다.
    const links = screen.getAllByRole("link");
    const hrefs = links.map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/v/week-1");
    expect(hrefs).not.toContain("/v/week-2");
  });

  it("없는 강좌는 안내 화면", async () => {
    mocks.get.mockRejectedValue(axiosError(404));
    renderPage();
    expect(await screen.findByText("강좌를 찾을 수 없습니다")).toBeTruthy();
  });

  it("발행 강의가 없으면 그 사실을 알린다", async () => {
    mocks.get.mockResolvedValue({
      data: { ...COURSE, lecture_count: 0, lectures: [] },
    });
    renderPage();
    expect(await screen.findByText(/아직 발행된 강의가 없습니다/)).toBeTruthy();
  });
});
