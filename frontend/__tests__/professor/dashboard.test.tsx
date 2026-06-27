import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import ProfessorDashboardPage from "@/app/professor/dashboard/page";
import { I18nProvider } from "@/contexts/I18nContext";
import { ToastProvider } from "@/components/ui/Toast";
import { invalidateProfessorData } from "@/lib/professorData";

// API 모킹 — 강의 0개 케이스 vs 1개 케이스 테스트별로 변경
const apiGet = vi.fn();
const apiPatch = vi.fn().mockResolvedValue({ data: { ok: true } });
vi.mock("@/lib/api", () => ({
  api: {
    get: (url: string) => apiGet(url),
    patch: (url: string, body: unknown) => apiPatch(url, body),
  },
}));

const renderPage = (ui: ReactNode) =>
  render(
    <I18nProvider>
      <ToastProvider>{ui}</ToastProvider>
    </I18nProvider>,
  );

beforeEach(() => {
  apiGet.mockReset();
  apiPatch.mockClear();
  // 강좌·강의 공유 캐시는 모듈 레벨 상태라 테스트 간 누수된다 → 매 테스트 전 초기화.
  invalidateProfessorData();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ProfessorDashboardPage", () => {
  it("shows the empty-state onboarding when the professor has zero lectures", async () => {
    apiGet.mockImplementation(async (url: string) => {
      if (url === "/api/courses") return { data: [] };
      return { data: [] };
    });

    renderPage(<ProfessorDashboardPage />);

    await waitFor(() =>
      expect(screen.getByTestId("professor-empty-dashboard")).toBeTruthy(),
    );
    expect(screen.getByTestId("professor-onboarding-checklist")).toBeTruthy();
    // 5단계 모두 노출
    expect(screen.getByTestId("professor-onboarding-step-profile")).toBeTruthy();
    expect(screen.getByTestId("professor-onboarding-step-share")).toBeTruthy();
    // 첫 강의 만들기 CTA
    expect(screen.getByTestId("professor-empty-primary-cta")).toBeTruthy();
  });

  it("treats the profile step as already done and never auto-opens a profile modal", async () => {
    // 교수자는 OAuth 가입 시 학교·학과를 입력하므로 대시보드 도착 시점에
    // user.school/department 가 이미 채워져 있다 → profile 단계는 자동 완료이고,
    // 같은 정보를 다시 묻는 모달은 더 이상 뜨지 않는다.
    apiGet.mockImplementation(async (url: string) => {
      if (url === "/api/courses") return { data: [] };
      return { data: [] };
    });

    renderPage(<ProfessorDashboardPage />);

    await waitFor(() =>
      expect(screen.getByTestId("professor-empty-dashboard")).toBeTruthy(),
    );
    // profile 단계는 이미 완료, course 가 다음 active 단계
    expect(
      screen
        .getByTestId("professor-onboarding-step-profile")
        .getAttribute("data-status"),
    ).toBe("done");
    expect(
      screen
        .getByTestId("professor-onboarding-step-course")
        .getAttribute("data-status"),
    ).toBe("active");
    // 학과·소속 입력 모달은 자동으로 뜨지 않는다
    expect(screen.queryByTestId("professor-profile-form")).toBeNull();
  });

  it("falls back to the regular lecture grid when at least one lecture exists", async () => {
    apiGet.mockImplementation(async (url: string) => {
      if (url === "/api/courses") {
        return { data: [{ id: "c1", title: "강좌 A" }] };
      }
      if (url === "/api/me/lectures" || url === "/api/courses/c1/lectures") {
        return {
          data: [
            {
              id: "l1",
              title: "현대중국사회의이해 1주차",
              slug: "ccs-1",
              is_published: true,
              video_url: "https://cdn/x.mp4",
              pipeline_task_id: "task-1",
              course_id: "c1",
            },
          ],
        };
      }
      return { data: [] };
    });

    renderPage(<ProfessorDashboardPage />);

    // 슬라이드 이미지 없는 강의는 제목 기반 대체 카드를 그려, 제목이 카드 표지와
    // 하단 라벨 두 곳에 나타날 수 있다(실제 슬라이드 카드와 동일한 모양). 그리드가
    // 떴는지(=empty-state 아님)만 확인하므로 getAllByText 로 1개 이상이면 통과.
    await waitFor(() =>
      expect(
        screen.getAllByText("현대중국사회의이해 1주차").length,
      ).toBeGreaterThan(0),
    );
    // empty-state 는 노출되지 않아야 한다
    expect(screen.queryByTestId("professor-empty-dashboard")).toBeNull();
    // 자동 모달도 안 뜬다
    expect(screen.queryByTestId("professor-profile-form")).toBeNull();
  });

});
