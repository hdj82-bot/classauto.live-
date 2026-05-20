import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "@/contexts/I18nContext";
import { ToastProvider } from "@/components/ui/Toast";

const apiGet = vi.fn();
const apiPatch = vi.fn();
const apiPost = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    get: (url: string, opts?: unknown) => apiGet(url, opts),
    patch: (url: string, body: unknown) => apiPatch(url, body),
    post: (url: string, body: unknown) => apiPost(url, body),
  },
}));

import ProfessorInboxPage from "@/app/professor/inbox/page";
import { inboxApi } from "@/components/professor/inbox/inboxApi";

const renderPage = (ui: ReactNode) =>
  render(
    <I18nProvider>
      <ToastProvider>{ui}</ToastProvider>
    </I18nProvider>,
  );

beforeEach(() => {
  apiGet.mockReset();
  apiPatch.mockReset();
  apiPost.mockReset();
  inboxApi._clearLocalOverrides();
});

/**
 * 모든 시나리오에서 mock 경로 (deferred 배너 노출) 로 들어가도록
 * `/api/v1/inbox` 와 `/api/courses` 를 빈 응답으로 만들어둔다.
 */
function mockEmptyBackend() {
  apiGet.mockImplementation(async (url: string) => {
    if (url === "/api/v1/inbox") {
      throw Object.assign(new Error("nf"), { response: { status: 404 } });
    }
    if (url === "/api/courses") return { data: [] };
    throw new Error(`unhandled GET ${url}`);
  });
}

describe("ProfessorInboxPage (redesigned report view)", () => {
  it("renders the deferred banner when backend is missing", async () => {
    mockEmptyBackend();
    renderPage(<ProfessorInboxPage />);
    await waitFor(() =>
      expect(screen.getByTestId("inbox-page")).toBeTruthy(),
    );
    expect(screen.getByTestId("inbox-deferred-banner")).toBeTruthy();
  });

  it("renders the grouped lecture list with all mock items (no status tabs)", async () => {
    mockEmptyBackend();
    renderPage(<ProfessorInboxPage />);

    await waitFor(() =>
      expect(screen.getByTestId("inbox-list")).toBeTruthy(),
    );
    // 신규 뷰는 모든 status 의 mock 시드(8건) 를 한 번에 보여준다.
    expect(screen.getByTestId("inbox-row-qa-needs-1")).toBeTruthy();
    expect(screen.getByTestId("inbox-row-qa-auto-1")).toBeTruthy();
    expect(screen.getByTestId("inbox-row-qa-off-1")).toBeTruthy();
    // status 탭 / 미답변 토글은 사라져야 한다.
    expect(screen.queryByTestId("inbox-tab-needs_professor")).toBeNull();
    expect(screen.queryByTestId("inbox-tab-auto_answered")).toBeNull();
    expect(screen.queryByTestId("inbox-unanswered-only")).toBeNull();
  });

  it("groups items by lecture (lecture header per group)", async () => {
    mockEmptyBackend();
    renderPage(<ProfessorInboxPage />);

    await waitFor(() => screen.getByTestId("inbox-list"));
    // mock 시드의 lectureId 가 그대로 그룹 testid 로 노출.
    expect(screen.getByTestId("inbox-group-lec-ccs-1")).toBeTruthy();
    expect(screen.getByTestId("inbox-group-lec-corpus-1")).toBeTruthy();
  });

  it("shows RAG similarity (%) on each row when available", async () => {
    mockEmptyBackend();
    renderPage(<ProfessorInboxPage />);

    await waitFor(() => screen.getByTestId("inbox-list"));
    // qa-needs-1 의 시드는 topSimilarity 0.78 → 78%
    const sim = screen.getByTestId("inbox-row-similarity-qa-needs-1");
    expect(sim.textContent).toContain("78");
  });

  it("filters by course when a sidebar item is clicked", async () => {
    mockEmptyBackend();
    renderPage(<ProfessorInboxPage />);

    await waitFor(() => screen.getByTestId("inbox-list"));
    fireEvent.click(screen.getByTestId("inbox-course-course-corpus"));

    await waitFor(() =>
      expect(screen.getByTestId("inbox-row-qa-needs-3")).toBeTruthy(),
    );
    // 다른 강의의 행은 안 보여야 한다.
    expect(screen.queryByTestId("inbox-row-qa-needs-1")).toBeNull();
    expect(screen.queryByTestId("inbox-row-qa-auto-1")).toBeNull();
  });

  it("filters by question / answer text via the search input", async () => {
    mockEmptyBackend();
    renderPage(<ProfessorInboxPage />);

    await waitFor(() => screen.getByTestId("inbox-list"));

    const input = screen.getByTestId("inbox-search") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "시험" } });

    // mock 시드 q8 ("이번 시험 범위가...") 만 남아야 한다.
    await waitFor(() =>
      expect(screen.getByTestId("inbox-row-qa-off-3")).toBeTruthy(),
    );
    expect(screen.queryByTestId("inbox-row-qa-needs-1")).toBeNull();
  });

  it("shows the report download card with the all-courses hint by default", async () => {
    mockEmptyBackend();
    renderPage(<ProfessorInboxPage />);

    await waitFor(() => screen.getByTestId("inbox-report-card"));
    expect(screen.getByTestId("inbox-report-download")).toBeTruthy();
  });

  it("invokes /api/v1/qa/export when the download button is clicked (all courses)", async () => {
    apiGet.mockImplementation(async (url: string) => {
      if (url === "/api/v1/inbox") {
        throw Object.assign(new Error("nf"), { response: { status: 404 } });
      }
      if (url === "/api/courses") return { data: [] };
      if (url.startsWith("/api/v1/qa/export")) {
        return { data: new Blob(["a,b,c\n1,2,3"], { type: "text/csv" }) };
      }
      throw new Error(`unhandled GET ${url}`);
    });

    // jsdom 은 createObjectURL / revokeObjectURL 이 기본 미정의 — stub.
    const originalCreate = window.URL.createObjectURL;
    const originalRevoke = window.URL.revokeObjectURL;
    window.URL.createObjectURL = vi.fn(() => "blob:mock");
    window.URL.revokeObjectURL = vi.fn();

    try {
      renderPage(<ProfessorInboxPage />);
      await waitFor(() => screen.getByTestId("inbox-report-download"));

      await act(async () => {
        fireEvent.click(screen.getByTestId("inbox-report-download"));
      });

      await waitFor(() => {
        const called = apiGet.mock.calls.some((c) =>
          String(c[0]).startsWith("/api/v1/qa/export"),
        );
        expect(called).toBe(true);
      });

      const exportCall = apiGet.mock.calls.find((c) =>
        String(c[0]).startsWith("/api/v1/qa/export"),
      )!;
      // 기본 스코프는 전체 — course_id 가 붙지 않아야 한다.
      expect(String(exportCall[0])).not.toContain("course_id");
      expect(String(exportCall[0])).toContain("format=csv");
    } finally {
      window.URL.createObjectURL = originalCreate;
      window.URL.revokeObjectURL = originalRevoke;
    }
  });

  it("passes course_id when a specific course is selected and download is clicked", async () => {
    apiGet.mockImplementation(async (url: string) => {
      if (url === "/api/v1/inbox") {
        throw Object.assign(new Error("nf"), { response: { status: 404 } });
      }
      if (url === "/api/courses") return { data: [] };
      if (url.startsWith("/api/v1/qa/export")) {
        return { data: new Blob(["x"], { type: "text/csv" }) };
      }
      throw new Error(`unhandled GET ${url}`);
    });

    const originalCreate = window.URL.createObjectURL;
    const originalRevoke = window.URL.revokeObjectURL;
    window.URL.createObjectURL = vi.fn(() => "blob:mock");
    window.URL.revokeObjectURL = vi.fn();

    try {
      renderPage(<ProfessorInboxPage />);
      await waitFor(() => screen.getByTestId("inbox-list"));
      fireEvent.click(screen.getByTestId("inbox-course-course-corpus"));
      await waitFor(() => screen.getByTestId("inbox-report-download"));

      await act(async () => {
        fireEvent.click(screen.getByTestId("inbox-report-download"));
      });

      await waitFor(() => {
        const call = apiGet.mock.calls.find((c) =>
          String(c[0]).startsWith("/api/v1/qa/export"),
        );
        expect(call).toBeDefined();
        expect(String(call?.[0])).toContain("course_id=course-corpus");
      });
    } finally {
      window.URL.createObjectURL = originalCreate;
      window.URL.revokeObjectURL = originalRevoke;
    }
  });

  it("does not render status badges, checkboxes, composer or bulk bar", async () => {
    mockEmptyBackend();
    renderPage(<ProfessorInboxPage />);

    await waitFor(() => screen.getByTestId("inbox-list"));

    // 폐기된 요소가 다시 살아나지 않도록 회귀 차원에서 점검.
    expect(screen.queryByTestId("inbox-status-tabs")).toBeNull();
    expect(screen.queryByTestId("inbox-select-all")).toBeNull();
    expect(screen.queryByTestId("inbox-bulk-bar")).toBeNull();
    expect(screen.queryByTestId("inbox-answer-composer")).toBeNull();
    expect(screen.queryByTestId("inbox-row-check-qa-needs-1")).toBeNull();
  });
});
