import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { I18nProvider } from "@/contexts/I18nContext";

/**
 * 스펙 14 §C — 이슈 인박스 화면.
 *
 * 여기서 지켜야 하는 것:
 *   1. 서버가 준 묶음을 **그대로** 한 줄로 그린다. 화면이 다시 펼치면 §C 의 핵심
 *      요구("같은 사고가 N줄로 보이면 안 됨")가 화면 단에서 무너진다.
 *   2. 드로어는 `error_message` **원문**을 보여준다.
 *   3. 하단 액션 바에 "해결로 표시" 버튼이 없다 — 해결은 파생값이라 누를 수 없다.
 */

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  detail: vi.fn(),
  triage: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock("@/lib/api", () => ({
  issuesApi: { list: mocks.list, detail: mocks.detail, triage: mocks.triage },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin/issues",
  useParams: () => ({}),
  useSearchParams: () => mocks.searchParams,
}));

import AdminIssuesPage from "@/app/admin/issues/page";

const RAW_ERROR = "HeyGen 429 Too Many Requests — rate limit exceeded (retry-after: 60)";

/** 슬라이드 5개가 깨진 사고 하나 — 서버가 이미 한 줄로 묶어 준 모양. */
const ISSUE = {
  id: "r-rep",
  render_ids: ["r1", "r2", "r3", "r4", "r5"],
  lecture_id: "lec-1",
  lecture_title: "중국어 통사론 3주차",
  course_title: "2026-2 중국어 통사론",
  user_id: "u1",
  user_name: "김지훈",
  user_email: "kim@kyonggi.ac.kr",
  cohort: "2026-08",
  provider: "heygen",
  tts_provider: "elevenlabs",
  error_message: RAW_ERROR,
  error_messages: [RAW_ERROR],
  affected_slides: [1, 2, 3, 4, 5],
  affected_count: 5,
  created_at: "2026-07-25T09:41:00Z",
  last_failed_at: "2026-07-25T09:43:00Z",
  status: "new" as const,
  triaged_at: null,
  triage_note: null,
};

const listPayload = (overrides: Record<string, unknown> = {}) => ({
  data: {
    total: 1,
    page: 1,
    limit: 50,
    since_days: 7,
    counts: { new: 1, triaged: 0, resolved: 0 },
    truncated: false,
    issues: [ISSUE],
    ...overrides,
  },
});

const renderPage = () =>
  render(
    <I18nProvider>
      <AdminIssuesPage />
    </I18nProvider>,
  );

describe("AdminIssuesPage — 스펙 14 §C", () => {
  beforeEach(() => {
    mocks.list.mockReset();
    mocks.triage.mockReset();
    mocks.searchParams = new URLSearchParams();
    mocks.list.mockResolvedValue(listPayload());
    mocks.triage.mockResolvedValue({
      data: { id: "r-rep", triaged_at: "2026-07-26T00:00:00Z", triage_note: null },
    });
  });

  it("슬라이드 5개짜리 사고를 표에 한 줄로 그린다", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("중국어 통사론 3주차")).toBeTruthy());

    // 강의 제목이 표에 딱 한 번 — 슬라이드마다 반복되면 §C 위반이다.
    expect(screen.getAllByText("중국어 통사론 3주차")).toHaveLength(1);
    expect(screen.getByText("슬라이드 5개")).toBeTruthy();
  });

  it("미확인 건수를 타일로 보여준다", async () => {
    renderPage();
    // "미확인"은 타일 라벨과 행의 상태 칩 양쪽에 나온다 — 부제로 타일을 특정한다.
    await waitFor(() => expect(screen.getByText("아직 아무도 안 본 사고")).toBeTruthy());

    const tile = screen.getByText("아직 아무도 안 본 사고").closest("div") as HTMLElement;
    expect(within(tile).getByText("미확인")).toBeTruthy();
    expect(within(tile).getByText("1")).toBeTruthy();
  });

  it("행을 열면 드로어가 error_message 원문을 그대로 보여준다", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("중국어 통사론 3주차")).toBeTruthy());

    fireEvent.click(screen.getByText("중국어 통사론 3주차"));

    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    // 표에도 같은 문구가 잘린 채 있으므로 드로어 안으로 좁혀 확인한다.
    const drawer = within(screen.getByRole("dialog"));
    // 잘리거나 가공되지 않은 원문.
    expect(drawer.getByText(RAW_ERROR)).toBeTruthy();
    expect(drawer.getByText("error_message")).toBeTruthy();
  });

  it("드로어 액션 바에는 triage 만 있다 — '해결'은 파생값이라 버튼이 없다", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("중국어 통사론 3주차")).toBeTruthy());
    fireEvent.click(screen.getByText("중국어 통사론 3주차"));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());

    expect(screen.getByRole("button", { name: "확인함으로 표시" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /해결로 표시/ })).toBeNull();
  });

  it("확인함으로 표시하면 메모와 함께 triage 를 호출하고 목록을 다시 읽는다", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("중국어 통사론 3주차")).toBeTruthy());
    fireEvent.click(screen.getByText("중국어 통사론 3주차"));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText("원인·조치 메모 (선택)"), {
      target: { value: "HeyGen 동시 요청 제한" },
    });
    fireEvent.click(screen.getByRole("button", { name: "확인함으로 표시" }));

    await waitFor(() =>
      expect(mocks.triage).toHaveBeenCalledWith("r-rep", "HeyGen 동시 요청 제한"),
    );
    // 표시 직후 목록을 다시 읽어 상태·카운트를 갱신한다.
    await waitFor(() => expect(mocks.list.mock.calls.length).toBeGreaterThan(1));
  });

  it("user_id 쿼리가 있으면 그 테스터로 좁혀 조회한다", async () => {
    mocks.searchParams = new URLSearchParams("user_id=u1");
    renderPage();

    await waitFor(() =>
      expect(mocks.list).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: "u1" }),
      ),
    );
  });

  it("잘린 응답이면 그 사실을 알린다 — 조용히 자르지 않는다", async () => {
    mocks.list.mockResolvedValue(listPayload({ truncated: true }));
    renderPage();

    await waitFor(() =>
      expect(
        screen.getByText("실패 건수가 많아 최근 일부만 표시했습니다. 기간을 좁혀 보세요."),
      ).toBeTruthy(),
    );
  });

  it("실패한 렌더가 없으면 빈 상태를 그린다", async () => {
    mocks.list.mockResolvedValue(
      listPayload({ total: 0, issues: [], counts: { new: 0, triaged: 0, resolved: 0 } }),
    );
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("이 기간에 실패한 렌더가 없습니다.")).toBeTruthy(),
    );
  });

  it("조회에 실패해도 화면이 죽지 않고 오류만 알린다", async () => {
    mocks.list.mockRejectedValue(new Error("500"));
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("이슈 목록을 불러오지 못했습니다.")).toBeTruthy(),
    );
  });
});
