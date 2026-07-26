import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/contexts/I18nContext";

/**
 * 수강 명단 — 스펙 15 2단계.
 *
 * 회귀 가드:
 *   1. 등록만 하고 한 번도 안 본 학생이 **보인다** — 이 화면이 존재하는 이유(§1.2)
 *   2. 제적자를 목록에서 지우지 않는다(§3.1)
 *   3. 제적은 확인 한 단계를 거친다 — 학생은 스스로 되돌릴 수 없다(§4.2)
 *   4. 제적을 되돌릴 수 있다
 */

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock("@/lib/api", () => ({ api: { get: mocks.get, post: mocks.post } }));

import CourseRoster from "@/components/professor/learners/CourseRoster";

const ROSTER = {
  course_id: "course-1",
  course_title: "중국어문법의 이해",
  active_count: 2,
  withdrawn_count: 1,
  never_watched_count: 1,
  entries: [
    {
      enrollment_id: "e1",
      student_id: "s1",
      name: "김학생",
      student_number: "202512345",
      status: "active",
      section: null,
      source: "link",
      joined_at: "2026-03-02T01:00:00Z",
      last_watched_at: "2026-03-09T05:00:00Z",
    },
    {
      enrollment_id: "e2",
      student_id: "s2",
      name: "이학생",
      student_number: "202567890",
      status: "active",
      section: null,
      source: "link",
      joined_at: "2026-03-02T01:05:00Z",
      last_watched_at: null,
    },
    {
      enrollment_id: "e3",
      student_id: "s3",
      name: "박학생",
      student_number: "202511111",
      status: "withdrawn",
      section: null,
      source: "link",
      joined_at: "2026-03-02T01:10:00Z",
      last_watched_at: null,
    },
  ],
};

const renderRoster = () =>
  render(
    <I18nProvider>
      <CourseRoster courseId="course-1" />
    </I18nProvider>,
  );

describe("CourseRoster", () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.post.mockReset();
    mocks.get.mockResolvedValue({ data: ROSTER });
  });

  it("등록 학생을 이름·학번과 함께 보여준다", async () => {
    renderRoster();
    expect(await screen.findByText("김학생")).toBeTruthy();
    expect(screen.getByText("202512345")).toBeTruthy();
  });

  it("한 번도 안 본 학생이 드러난다", async () => {
    renderRoster();
    await screen.findByText("이학생");
    // 종전에는 세션 행이 없으면 존재 자체가 보이지 않았다(§1.2).
    expect(screen.getAllByText("시청 기록 없음").length).toBeGreaterThan(0);
  });

  it("제적자를 목록에서 지우지 않는다", async () => {
    renderRoster();
    // 빼면 "그 학생 어디 갔지"를 확인할 방법이 사라진다.
    expect(await screen.findByText("박학생")).toBeTruthy();
    expect(screen.getByTestId("roster-reactivate-e3")).toBeTruthy();
  });

  it("제적은 확인 한 단계를 거친다", async () => {
    renderRoster();
    fireEvent.click(await screen.findByTestId("roster-withdraw-e1"));

    // 첫 클릭만으로 요청이 나가면 오조작 한 번이 학생을 학기 내내 잠근다.
    expect(mocks.post).not.toHaveBeenCalled();
    expect(screen.getByTestId("roster-withdraw-confirm-e1")).toBeTruthy();
  });

  it("확인하면 제적 요청을 보내고 그 행만 갱신한다", async () => {
    mocks.post.mockResolvedValue({
      data: { ...ROSTER.entries[0], status: "withdrawn" },
    });
    renderRoster();

    fireEvent.click(await screen.findByTestId("roster-withdraw-e1"));
    fireEvent.click(screen.getByTestId("roster-withdraw-confirm-e1"));

    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith("/api/v1/enrollments/e1/withdraw"),
    );
    // 목록 전체를 다시 받지 않는다.
    expect(mocks.get).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId("roster-reactivate-e1")).toBeTruthy());
  });

  it("제적을 되돌릴 수 있다", async () => {
    mocks.post.mockResolvedValue({
      data: { ...ROSTER.entries[2], status: "active" },
    });
    renderRoster();

    fireEvent.click(await screen.findByTestId("roster-reactivate-e3"));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith("/api/v1/enrollments/e3/reactivate"),
    );
  });

  it("쓰기가 실패하면 서버 상태를 다시 읽는다", async () => {
    mocks.post.mockRejectedValue(new Error("boom"));
    renderRoster();

    fireEvent.click(await screen.findByTestId("roster-withdraw-e1"));
    fireEvent.click(screen.getByTestId("roster-withdraw-confirm-e1"));

    // 낙관적 갱신이 어긋난 채 남으면 제적했다고 믿는 학생이 계속 시청한다.
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
  });

  it("등록자가 없으면 QR 을 띄우라고 안내한다", async () => {
    mocks.get.mockResolvedValue({
      data: { ...ROSTER, entries: [], active_count: 0, withdrawn_count: 0, never_watched_count: 0 },
    });
    renderRoster();
    expect(await screen.findByTestId("roster-empty")).toBeTruthy();
  });

  it("불러오기 실패는 알린다", async () => {
    mocks.get.mockRejectedValue(new Error("boom"));
    renderRoster();
    expect(await screen.findByRole("alert")).toBeTruthy();
  });
});
