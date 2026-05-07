import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import LearnersIndexPage from "@/app/professor/learners/page";
import { I18nProvider } from "@/contexts/I18nContext";
import { ToastProvider } from "@/components/ui/Toast";

const apiGet = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    get: (url: string, opts?: unknown) => apiGet(url, opts),
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
      if (url === "/api/courses/c1/lectures") {
        return {
          data: [
            { id: "lec1", title: "1주차 — 디지털 위안화", slug: "wk1", is_published: true },
            { id: "lec2", title: "2주차 — 핀테크 규제", slug: "wk2", is_published: false },
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

  it("does not render any external-share or marketing action elements", async () => {
    apiGet.mockImplementation(async (url: string) => {
      if (url === "/api/courses") {
        return { data: [{ id: "c1", title: "강좌 A" }] };
      }
      if (url === "/api/courses/c1/lectures") {
        return {
          data: [{ id: "lec1", title: "1주차", slug: "x", is_published: true }],
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
