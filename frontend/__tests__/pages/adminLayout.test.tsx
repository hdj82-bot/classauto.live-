import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/contexts/I18nContext";

// admin/layout.tsx 는 ProtectedRoute 를 감싸므로 AuthContext 가 필요.
// admin role 사용자를 강제 주입한 mock 으로 감싸 내비 구성만 검증한다.
vi.mock("@/components/ProtectedRoute", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mocks = vi.hoisted(() => ({ adminList: vi.fn(), issuesList: vi.fn() }));

vi.mock("@/lib/api", () => ({
  feedbackApi: { adminList: mocks.adminList },
  issuesApi: { list: mocks.issuesList },
}));

import AdminLayout from "@/app/admin/layout";

const renderLayout = () =>
  render(
    <I18nProvider>
      <AdminLayout>
        <div>child</div>
      </AdminLayout>
    </I18nProvider>,
  );

/** 사이드바 링크의 href 집합. */
const navHrefs = () =>
  screen
    .getAllByRole("link")
    .map((a) => a.getAttribute("href"))
    .filter((h): h is string => !!h);

const issueCounts = (n: number) => ({
  data: { counts: { new: n, triaged: 0, resolved: 0 }, issues: [], total: 0 },
});

describe("AdminLayout — 스펙 14 §E 사이드바 + §C 이슈 인박스", () => {
  beforeEach(() => {
    mocks.adminList.mockReset();
    mocks.adminList.mockResolvedValue({ data: { total: 0, feedback: [] } });
    mocks.issuesList.mockReset();
    mocks.issuesList.mockResolvedValue(issueCounts(0));
  });

  it("운영·품질·감시 3그룹으로 묶인다", async () => {
    renderLayout();
    expect(await screen.findByText("운영")).toBeTruthy();
    expect(screen.getByText("품질")).toBeTruthy();
    expect(screen.getByText("감시")).toBeTruthy();
  });

  it("최종 항목은 9개다 — 이슈 인박스가 품질 그룹 맨 앞에 붙는다", async () => {
    renderLayout();
    await screen.findByText("운영");

    expect(navHrefs()).toEqual([
      "/admin",
      "/admin/invites",
      "/admin/beta",
      "/admin/issues",
      "/admin/feedback",
      "/admin/applications",
      "/admin/costs",
      "/admin/audit",
      "/admin/system",
    ]);
  });

  it("/admin/users 는 사이드바에서 빠진다(라우트 자체는 유지)", async () => {
    renderLayout();
    await screen.findByText("운영");
    expect(navHrefs()).not.toContain("/admin/users");
    expect(screen.queryByText("사용자 관리")).toBeNull();
  });

  it("미처리 피드백 수를 배지로 노출한다", async () => {
    mocks.adminList.mockResolvedValue({ data: { total: 3, feedback: [] } });
    renderLayout();

    await waitFor(() => expect(screen.getByText("3")).toBeTruthy());
    expect(mocks.adminList).toHaveBeenCalledWith({ status: "open" });
  });

  it("미확인 이슈 수를 배지로 노출한다 — 행 수가 아니라 counts.new(패스 수)", async () => {
    mocks.issuesList.mockResolvedValue(issueCounts(4));
    renderLayout();

    await waitFor(() => expect(screen.getByText("4")).toBeTruthy());
    // 목록과 같은 기준(7일)으로 세야 배지와 화면이 어긋나지 않는다.
    expect(mocks.issuesList).toHaveBeenCalledWith({ since: "7d", limit: 1 });
  });

  it("미처리가 0이면 배지를 그리지 않는다", async () => {
    renderLayout();
    await screen.findByText("운영");
    expect(screen.queryByText("0")).toBeNull();
  });

  it("배지 조회가 실패해도 콘솔은 그대로 렌더된다", async () => {
    mocks.adminList.mockRejectedValue(new Error("500"));
    mocks.issuesList.mockRejectedValue(new Error("500"));
    renderLayout();

    expect(await screen.findByText("운영")).toBeTruthy();
    expect(screen.getByText("child")).toBeTruthy();
  });

  it("이슈 배지가 죽어도 피드백 배지는 살아 있다", async () => {
    // 두 조회를 하나로 묶어 await 하면 한쪽 장애가 다른 배지까지 0 으로 만든다.
    mocks.adminList.mockResolvedValue({ data: { total: 2, feedback: [] } });
    mocks.issuesList.mockRejectedValue(new Error("500"));
    renderLayout();

    await waitFor(() => expect(screen.getByText("2")).toBeTruthy());
  });

  it("하드코딩 한국어가 아니라 i18n 키를 쓴다", async () => {
    renderLayout();
    expect(await screen.findByText("ClassAuto")).toBeTruthy();
    expect(screen.getByText("개요")).toBeTruthy();
    expect(screen.getByText("베타 현황")).toBeTruthy();
    expect(screen.getByText("이슈 인박스")).toBeTruthy();
    expect(screen.getByText("비용")).toBeTruthy();
    expect(screen.getByText("시스템")).toBeTruthy();
  });
});
