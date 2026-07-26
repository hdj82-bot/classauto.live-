import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { I18nProvider } from "@/contexts/I18nContext";

/**
 * 스펙 14 §E(행 오버플로 메뉴) + §B(드릴다운 라우트 교체).
 *
 * 여기서 지켜야 하는 두 가지:
 *   1. 드릴다운은 `/admin/testers/[id]` **라우트**다. E 시점엔 인라인 확장이었고
 *      B 가 그 화면을 만들면서 교체했다.
 *   2. 메뉴에는 PRO 분석 토글만 둔다. 역할 변경·유저 삭제는 /admin/users 에 남고
 *      메뉴의 딥링크로 도달한다.
 */

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  toast: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: { get: mocks.get, patch: mocks.patch },
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

// 전역 setup 의 useRouter 는 호출마다 새 vi.fn 을 돌려줘 push 를 추적할 수 없다.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin/beta",
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

import AdminBetaPage from "@/app/admin/beta/page";

const INSTRUCTOR = {
  id: "u1",
  email: "prof@k.ac.kr",
  name: "하두진",
  cohort: "2026-08",
  last_active_at: "2026-07-20T00:00:00Z",
  courses_count: 2,
  lectures_count: 12,
  published_lectures_count: 8,
  renders_count: 30,
  spend_this_month_usd: 12.5,
  spend_total_usd: 41.2,
  spend_monthly_avg_usd: 13.7,
};

/** URL 별 응답 라우팅. proEnabled 로 PRO 조인 결과를 바꾼다. */
function mockApi({ proEnabled = false, usersFail = false }: { proEnabled?: boolean; usersFail?: boolean } = {}) {
  mocks.get.mockImplementation((url: string) => {
    if (url.startsWith("/api/v1/admin/beta-overview")) {
      return Promise.resolve({ data: { instructors: [INSTRUCTOR] } });
    }
    if (url.startsWith("/api/v1/admin/funnel")) {
      return Promise.resolve({
        data: { steps: [{ step: "invited", count: 10, conversion_from_prev_pct: 100 }] },
      });
    }
    if (url === "/api/v1/admin/users") {
      if (usersFail) return Promise.reject(new Error("500"));
      return Promise.resolve({
        data: { users: [{ id: "u1", analytics_pro_enabled: proEnabled }] },
      });
    }
    if (url.startsWith("/api/v1/admin/users/")) {
      return Promise.resolve({
        data: {
          id: "u1",
          email: "prof@k.ac.kr",
          cohort: "2026-08",
          beta_consented_at: "2026-07-02T00:00:00Z",
          lectures_count: 1,
          lectures: [
            { id: "l1", title: "把자문의 이해", is_published: true, course_title: "중국어문법", updated_at: null },
          ],
          spend_total_usd: 41.2,
          monthly_spend: [{ year: 2026, month: 7, cost_usd: 12.5 }],
        },
      });
    }
    return Promise.resolve({ data: {} });
  });
}

const renderPage = () =>
  render(
    <I18nProvider>
      <AdminBetaPage />
    </I18nProvider>,
  );

describe("AdminBetaPage — 행 오버플로 메뉴", () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.patch.mockReset();
    mocks.toast.mockReset();
    mocks.push.mockReset();
    mockApi();
  });

  it("행 클릭은 테스터 상세로 이동한다(B — 인라인 확장 대체)", async () => {
    renderPage();
    const nameLink = await screen.findByText("하두진");

    // 이름은 실제 링크여야 새 탭·북마크가 된다.
    expect(nameLink.getAttribute("href")).toBe("/admin/testers/u1");

    // 행 아무 데나 클릭해도 같은 곳으로 간다(편의).
    fireEvent.click(screen.getByText("prof@k.ac.kr"));
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/admin/testers/u1"),
    );

    // 인라인 확장은 더 이상 없다 — usage 를 이 화면에서 부르지 않는다.
    expect(screen.queryByText("把자문의 이해")).toBeNull();
  });

  it("메뉴에 PRO 토글과 사용자 관리 딥링크가 있다", async () => {
    mockApi({ proEnabled: true });
    renderPage();
    await screen.findByText("하두진");
    await waitFor(() =>
      expect(mocks.get).toHaveBeenCalledWith("/api/v1/admin/users", expect.anything()),
    );

    fireEvent.click(screen.getByRole("button", { name: "행 메뉴" }));

    const menu = await screen.findByRole("menu");
    expect(within(menu).getByText("PRO 분석")).toBeTruthy();
    expect(within(menu).getByText("ON")).toBeTruthy();
    expect(
      within(menu).getByText("역할 · 삭제는 사용자 관리에서").getAttribute("href"),
    ).toBe("/admin/users");
  });

  it("메뉴 버튼 클릭은 테스터 상세로 이동하지 않는다", async () => {
    renderPage();
    await screen.findByText("하두진");

    fireEvent.click(screen.getByRole("button", { name: "행 메뉴" }));
    await screen.findByRole("menu");
    // 행 클릭 이동과 충돌하면 메뉴를 열 때마다 화면이 넘어간다.
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("PRO 토글은 analytics_pro_enabled 를 뒤집어 PATCH 한다", async () => {
    mockApi({ proEnabled: false });
    mocks.patch.mockResolvedValue({ data: {} });
    renderPage();
    await screen.findByText("하두진");
    await waitFor(() =>
      expect(mocks.get).toHaveBeenCalledWith("/api/v1/admin/users", expect.anything()),
    );

    fireEvent.click(screen.getByRole("button", { name: "행 메뉴" }));
    const menu = await screen.findByRole("menu");
    fireEvent.click(within(menu).getByText("PRO 분석"));

    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith("/api/v1/admin/users/u1", null, {
        params: { analytics_pro_enabled: true },
      }),
    );
  });

  it("PRO 상태 조인이 실패하면 토글을 숨기고 딥링크만 남긴다", async () => {
    mockApi({ usersFail: true });
    renderPage();
    await screen.findByText("하두진");

    fireEvent.click(screen.getByRole("button", { name: "행 메뉴" }));
    const menu = await screen.findByRole("menu");
    // 상태를 모르는 채 토글을 보여주면 잘못된 상태를 누르게 된다.
    expect(within(menu).queryByText("PRO 분석")).toBeNull();
    expect(within(menu).getByText("역할 · 삭제는 사용자 관리에서")).toBeTruthy();
  });
});
