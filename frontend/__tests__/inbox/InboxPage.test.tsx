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

describe("ProfessorInboxPage", () => {
  it("renders the deferred banner when backend is missing", async () => {
    mockEmptyBackend();
    renderPage(<ProfessorInboxPage />);
    await waitFor(() =>
      expect(screen.getByTestId("inbox-page")).toBeTruthy(),
    );
    expect(screen.getByTestId("inbox-deferred-banner")).toBeTruthy();
  });

  it("opens on the needs_professor tab and lists action items", async () => {
    mockEmptyBackend();
    renderPage(<ProfessorInboxPage />);

    await waitFor(() =>
      expect(screen.getByTestId("inbox-list")).toBeTruthy(),
    );
    // needs_professor 탭이 활성화되어야 함
    const needsTab = screen.getByTestId("inbox-tab-needs_professor");
    expect(needsTab.getAttribute("aria-selected")).toBe("true");
    // mock 시드에는 needs_professor 가 3건
    expect(screen.getByTestId("inbox-row-qa-needs-1")).toBeTruthy();
    expect(screen.getByTestId("inbox-row-qa-needs-2")).toBeTruthy();
  });

  it("switches tab to auto_answered and shows AI replies", async () => {
    mockEmptyBackend();
    renderPage(<ProfessorInboxPage />);

    await waitFor(() => screen.getByTestId("inbox-list"));
    fireEvent.click(screen.getByTestId("inbox-tab-auto_answered"));

    await waitFor(() =>
      expect(screen.getByTestId("inbox-row-qa-auto-1")).toBeTruthy(),
    );
    // off_topic 탭에 해당하는 행은 사라져야 한다
    expect(screen.queryByTestId("inbox-row-qa-off-1")).toBeNull();
  });

  it("filters by course when a sidebar item is clicked", async () => {
    mockEmptyBackend();
    renderPage(<ProfessorInboxPage />);

    await waitFor(() => screen.getByTestId("inbox-list"));
    // 코퍼스 강좌만 필터 — 시드상 needs_professor 1건만 (qa-needs-3)
    fireEvent.click(screen.getByTestId("inbox-course-course-corpus"));

    await waitFor(() =>
      expect(screen.getByTestId("inbox-row-qa-needs-3")).toBeTruthy(),
    );
    expect(screen.queryByTestId("inbox-row-qa-needs-1")).toBeNull();
  });

  it("opens the right-pane thread when a row is selected and shows the AI draft", async () => {
    mockEmptyBackend();
    renderPage(<ProfessorInboxPage />);

    await waitFor(() => screen.getByTestId("inbox-list"));
    // qa-needs-2 는 aiDraft 가 있는 needs_professor 항목
    fireEvent.click(screen.getByTestId("inbox-row-open-qa-needs-2"));

    await waitFor(() =>
      expect(screen.getByTestId("inbox-thread-qa-needs-2")).toBeTruthy(),
    );
    expect(screen.getByTestId("inbox-thread-ai-draft")).toBeTruthy();
    expect(screen.getByTestId("inbox-answer-composer")).toBeTruthy();
  });

  it("rejects empty composer submissions", async () => {
    mockEmptyBackend();
    renderPage(<ProfessorInboxPage />);

    await waitFor(() => screen.getByTestId("inbox-list"));
    // qa-needs-3 는 aiDraft 가 없어 composer 가 빈 상태
    fireEvent.click(screen.getByTestId("inbox-row-open-qa-needs-3"));
    await waitFor(() => screen.getByTestId("inbox-answer-composer"));

    const sendBtn = screen.getByTestId("inbox-composer-send");
    await act(async () => {
      fireEvent.click(sendBtn);
    });
    expect(screen.getByTestId("inbox-composer-error")).toBeTruthy();
  });

  it("inserts the RAG draft when 'use draft' is clicked", async () => {
    mockEmptyBackend();
    renderPage(<ProfessorInboxPage />);

    await waitFor(() => screen.getByTestId("inbox-list"));
    fireEvent.click(screen.getByTestId("inbox-row-open-qa-needs-2"));
    await waitFor(() => screen.getByTestId("inbox-composer-use-draft"));

    const body = screen.getByTestId("inbox-composer-body") as HTMLTextAreaElement;
    // composer 는 mount 시점에 aiDraft 를 자동으로 주입 — 강제로 비워서 use-draft 동작 확인
    fireEvent.change(body, { target: { value: "" } });
    expect(body.value).toBe("");

    fireEvent.click(screen.getByTestId("inbox-composer-use-draft"));
    expect(body.value.length).toBeGreaterThan(0);
  });

  it("confirms an answer (deferred path) and updates the row to professor-confirmed", async () => {
    mockEmptyBackend();
    apiPatch.mockRejectedValue(
      Object.assign(new Error("nf"), { response: { status: 404 } }),
    );
    renderPage(<ProfessorInboxPage />);

    await waitFor(() => screen.getByTestId("inbox-list"));
    fireEvent.click(screen.getByTestId("inbox-row-open-qa-needs-2"));
    await waitFor(() => screen.getByTestId("inbox-composer-body"));

    await act(async () => {
      fireEvent.click(screen.getByTestId("inbox-composer-send"));
    });

    await waitFor(() =>
      expect(
        screen.getByTestId("inbox-row-confirmed-qa-needs-2"),
      ).toBeTruthy(),
    );
  });

  it("hides the bulk action bar until rows are checked", async () => {
    mockEmptyBackend();
    renderPage(<ProfessorInboxPage />);

    await waitFor(() => screen.getByTestId("inbox-list"));
    expect(screen.queryByTestId("inbox-bulk-bar")).toBeNull();

    fireEvent.click(screen.getByTestId("inbox-row-check-qa-needs-1"));
    await waitFor(() =>
      expect(screen.getByTestId("inbox-bulk-bar")).toBeTruthy(),
    );
  });

  it("bulk-confirms selected items via the confirmation modal (deferred)", async () => {
    mockEmptyBackend();
    apiPost.mockRejectedValue(
      Object.assign(new Error("nf"), { response: { status: 404 } }),
    );
    renderPage(<ProfessorInboxPage />);

    await waitFor(() => screen.getByTestId("inbox-list"));
    // qa-needs-1 과 qa-needs-2 는 둘 다 aiDraft 보유 → bulk 가능
    fireEvent.click(screen.getByTestId("inbox-row-check-qa-needs-1"));
    fireEvent.click(screen.getByTestId("inbox-row-check-qa-needs-2"));

    await waitFor(() => screen.getByTestId("inbox-bulk-bar"));
    fireEvent.click(screen.getByTestId("inbox-bulk-confirm"));
    await waitFor(() =>
      expect(screen.getByTestId("inbox-bulk-confirm-modal")).toBeTruthy(),
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("inbox-bulk-confirm-yes"));
    });

    // 두 항목 모두 professor-confirmed 배지가 떠야 한다
    await waitFor(() => {
      expect(
        screen.getByTestId("inbox-row-confirmed-qa-needs-1"),
      ).toBeTruthy();
      expect(
        screen.getByTestId("inbox-row-confirmed-qa-needs-2"),
      ).toBeTruthy();
    });
  });

  it("respects the unanswered-only filter on the active tab", async () => {
    mockEmptyBackend();
    renderPage(<ProfessorInboxPage />);

    await waitFor(() => screen.getByTestId("inbox-list"));
    // unansweredOnly=true 켜기 — needs_professor 시드는 모두 미답변이라 동일 결과지만
    // 토글이 동작 + 항목 유지되는지 회귀 확인.
    fireEvent.click(
      screen
        .getByTestId("inbox-unanswered-only")
        .querySelector("input")! as HTMLInputElement,
    );
    expect(screen.getByTestId("inbox-row-qa-needs-1")).toBeTruthy();
  });
});
