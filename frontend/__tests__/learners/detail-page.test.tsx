import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import LearnerDetailPage from "@/app/professor/learners/[lectureId]/[learnerId]/page";
import { I18nProvider } from "@/contexts/I18nContext";
import { ToastProvider } from "@/components/ui/Toast";

const apiGet = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    get: (url: string, opts?: unknown) => apiGet(url, opts),
  },
}));

vi.mock("next/navigation", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
    useParams: () => ({ lectureId: "lec-1", learnerId: "u-alice" }),
  };
});

const wrap = (ui: React.ReactNode) =>
  render(
    <I18nProvider>
      <ToastProvider>{ui}</ToastProvider>
    </I18nProvider>,
  );

beforeEach(() => {
  apiGet.mockReset();
});

describe("LearnerDetailPage", () => {
  it("renders learner stats when the learner exists in the lecture aggregates", async () => {
    apiGet.mockImplementation(async (url: string) => {
      if (url.endsWith("/attendance")) {
        return {
          data: {
            students: [
              {
                user_id: "u-alice",
                name: "앨리스",
                student_number: "201912345",
                type: "live",
                started_at: new Date().toISOString(),
                progress_pct: 85,
                status: "in_progress",
              },
            ],
          },
        };
      }
      if (url.endsWith("/engagement")) {
        return {
          data: {
            students: [
              {
                userId: "u-alice",
                name: "앨리스",
                student_number: "201912345",
                qaCount: 3,
                respondedCount: 3,
                noResponseCnt: 0,
                watchedSec: 600,
                totalSec: 750,
                responseRate: 100,
                watchRatio: 80,
              },
            ],
          },
        };
      }
      return { data: {} };
    });

    wrap(<LearnerDetailPage />);

    await waitFor(() =>
      expect(screen.getByTestId("learner-detail-page")).toBeTruthy(),
    );
    expect(screen.getByText("앨리스")).toBeTruthy();
    expect(screen.getByText("201912345")).toBeTruthy();
    // Q&A 와 평가 섹션은 백엔드 미흡 안내 노출
    expect(screen.getByTestId("learner-detail-qa-pending")).toBeTruthy();
    expect(screen.getByTestId("learner-detail-assessment-pending")).toBeTruthy();
    // 데이터 보호 안내 항상 노출
    expect(screen.getByTestId("learners-privacy-notice")).toBeTruthy();
  });

  it("renders the not-found state when learner is absent from the aggregates", async () => {
    apiGet.mockImplementation(async () => ({ data: { students: [] } }));
    wrap(<LearnerDetailPage />);
    await waitFor(() =>
      expect(screen.getByTestId("learner-detail-not-found")).toBeTruthy(),
    );
  });
});
