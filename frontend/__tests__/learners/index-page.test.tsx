import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import LearnersIndexPage from "@/app/professor/learners/page";
import { I18nProvider } from "@/contexts/I18nContext";
import { ToastProvider } from "@/components/ui/Toast";
import { invalidateProfessorData } from "@/lib/professorData";

const apiGet = vi.fn();
const apiPost = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    get: (url: string, opts?: unknown) => apiGet(url, opts),
    post: (url: string, body?: unknown) => apiPost(url, body),
  },
}));

const wrap = (ui: React.ReactNode) =>
  render(
    <I18nProvider>
      <ToastProvider>{ui}</ToastProvider>
    </I18nProvider>,
  );

beforeEach(() => {
  apiGet.mockReset();
  apiPost.mockReset();
  // 강좌·강의 공유 캐시는 모듈 레벨 상태라 테스트 간 누수된다 → 매 테스트 전 초기화.
  invalidateProfessorData();
});

describe("LearnersIndexPage", () => {
  it("shows the privacy notice on every visit", async () => {
    apiGet.mockImplementation(async (url: string) => {
      if (url === "/api/courses") return { data: [] };
      return { data: [] };
    });
    wrap(<LearnersIndexPage />);
    await waitFor(() =>
      expect(screen.getByTestId("learners-privacy-notice")).toBeTruthy(),
    );
  });

  it("renders the no-lectures empty state when no courses are returned", async () => {
    apiGet.mockImplementation(async (url: string) => {
      if (url === "/api/courses") return { data: [] };
      return { data: [] };
    });
    wrap(<LearnersIndexPage />);
    await waitFor(() =>
      expect(screen.getByTestId("learners-no-lectures")).toBeTruthy(),
    );
  });

  it("groups lectures under their course and exposes an open button", async () => {
    apiGet.mockImplementation(async (url: string) => {
      if (url === "/api/courses") {
        return {
          data: [{ id: "c1", title: "현대중국사회의이해" }],
        };
      }
      if (url === "/api/me/lectures" || url === "/api/courses/c1/lectures") {
        return {
          data: [
            { id: "lec1", title: "1주차 — 디지털 위안화", slug: "wk1", is_published: true, course_id: "c1" },
            { id: "lec2", title: "2주차 — 핀테크 규제", slug: "wk2", is_published: false, course_id: "c1" },
          ],
        };
      }
      return { data: [] };
    });

    wrap(<LearnersIndexPage />);

    await waitFor(() =>
      expect(screen.getByTestId("learners-course-c1")).toBeTruthy(),
    );
    expect(screen.getByText("현대중국사회의이해")).toBeTruthy();
    expect(screen.getByText("1주차 — 디지털 위안화")).toBeTruthy();
    expect(screen.getByText("2주차 — 핀테크 규제")).toBeTruthy();
    expect(screen.getByTestId("learners-open-lec1")).toBeTruthy();
    expect(screen.getByTestId("learners-open-lec2")).toBeTruthy();
  });

  // ── 강좌 단위 도구 (스펙 15 2단계) ──────────────────────────────────────
  // 사이드바가 이미 8개라 새 메뉴를 만들지 않고 이 화면 안에 붙였다.

  it("offers the course QR and roster inside the existing course card", async () => {
    apiGet.mockImplementation(async (url: string) => {
      if (url === "/api/courses") {
        return { data: [{ id: "c1", title: "강좌 A", slug: "gangjwa-a-a1b2c3d4" }] };
      }
      if (url === "/api/me/lectures") {
        return {
          data: [{ id: "lec1", title: "1주차", slug: "x", is_published: true, course_id: "c1" }],
        };
      }
      return { data: [] };
    });

    wrap(<LearnersIndexPage />);
    await waitFor(() => expect(screen.getByTestId("learners-course-c1")).toBeTruthy());

    fireEvent.click(screen.getByTestId("course-qr-toggle-c1"));
    await waitFor(() => expect(screen.getByTestId("course-qr-panel")).toBeTruthy());

    // 한 번에 하나만 — 카드가 무한정 길어지지 않게.
    fireEvent.click(screen.getByTestId("course-roster-toggle-c1"));
    await waitFor(() => expect(screen.queryByTestId("course-qr-panel")).toBeNull());
    await waitFor(() =>
      expect(apiGet).toHaveBeenCalledWith("/api/v1/enrollments/roster/c1", undefined),
    );
  });

  it("hides the QR button when the backend has no slug yet", async () => {
    // 프론트(Vercel)가 백엔드(Railway)보다 먼저 나가는 구간 — QR 만 빠지고 화면은 산다.
    apiGet.mockImplementation(async (url: string) => {
      if (url === "/api/courses") return { data: [{ id: "c1", title: "강좌 A" }] };
      if (url === "/api/me/lectures") {
        return {
          data: [{ id: "lec1", title: "1주차", slug: "x", is_published: true, course_id: "c1" }],
        };
      }
      return { data: [] };
    });

    wrap(<LearnersIndexPage />);
    await waitFor(() => expect(screen.getByTestId("learners-course-c1")).toBeTruthy());
    expect(screen.queryByTestId("course-qr-toggle-c1")).toBeNull();
    // 명단은 slug 와 무관하므로 남는다.
    expect(screen.getByTestId("course-roster-toggle-c1")).toBeTruthy();
  });

  it("keeps a course with no lectures so its QR can still be shown", async () => {
    // 학기 초에는 QR 로 등록을 먼저 받는 게 정상 순서다 — 종전에는 강의가 있어야만
    // 강좌가 보여서 그 시점에 이 화면이 비어 있었다.
    apiGet.mockImplementation(async (url: string) => {
      if (url === "/api/courses") {
        return { data: [{ id: "c1", title: "신규 강좌", slug: "singyu-a1b2c3d4" }] };
      }
      return { data: [] };
    });

    wrap(<LearnersIndexPage />);
    await waitFor(() => expect(screen.getByTestId("learners-course-c1")).toBeTruthy());
    expect(screen.getByTestId("learners-course-empty-c1")).toBeTruthy();
    expect(screen.getByTestId("course-qr-toggle-c1")).toBeTruthy();
  });

  it("does not render any external-share or marketing action elements", async () => {
    apiGet.mockImplementation(async (url: string) => {
      if (url === "/api/courses") {
        return { data: [{ id: "c1", title: "강좌 A" }] };
      }
      if (url === "/api/me/lectures" || url === "/api/courses/c1/lectures") {
        return {
          data: [{ id: "lec1", title: "1주차", slug: "x", is_published: true, course_id: "c1" }],
        };
      }
      return { data: [] };
    });

    wrap(<LearnersIndexPage />);

    await waitFor(() =>
      expect(screen.getByTestId("learners-course-c1")).toBeTruthy(),
    );

    // 학생 데이터 보호 정책 — 광고/외부 공유 UI 차단 검증.
    // (정책 *설명* 문구에는 "광고/마케팅" 단어가 부정문으로 등장하므로
    //  본문 전체 grep 대신 상호작용 요소(button/링크)만 스캔.)
    const interactiveTexts: string[] = [];
    document
      .querySelectorAll("button, a")
      .forEach((node) => interactiveTexts.push((node.textContent ?? "").toLowerCase()));

    for (const forbidden of [
      "광고",
      "advertis",
      "share to facebook",
      "share to x",
      "share to twitter",
      "share to kakao",
      "third-party",
    ]) {
      const hit = interactiveTexts.find((tx) => tx.includes(forbidden));
      expect(hit, `forbidden action label found: ${forbidden}`).toBeUndefined();
    }
  });
});
