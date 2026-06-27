import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { I18nProvider } from "@/contexts/I18nContext";
import { ToastProvider } from "@/components/ui/Toast";
import AnalyticsProPage from "@/app/professor/analytics-pro/page";

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    post: mocks.post,
  },
}));

const wrap = (ui: React.ReactNode) => (
  <I18nProvider>
    <ToastProvider>{ui}</ToastProvider>
  </I18nProvider>
);

const SAMPLE = {
  analysis: {
    student_count: 40,
    avg_score: 82,
    completion_rate: 90,
    avg_watched: 0.95,
    avg_questions: 1.4,
    study_min_per: 22,
    stdev: 10,
    drop_concentration: 20,
    weakness_totals: { 오개념: 3 },
    progress: { completed: 36, in_progress: 2, started: 1, none: 1 },
    roster: [],
    verdict: "excelling",
    verdict_reason: "이해도·완주율 동반 양호",
    recommended_direction: "심화·문제풀이",
  },
  ai: {
    verdict_sentence: "이번 영상은 전반적으로 우수합니다.",
    briefing: {
      approach_title: "심화 문제풀이",
      approach_detail: "응용 문제로 확장하세요.",
      opening_move: "도입 5분에 응용 사례를 제시하세요.",
      recommended_minutes: 60,
      focus_topics: ["오개념"],
    },
    student_solutions: [
      { name: "김학생", level: "우수", weakness: "없음", action: "심화 과제" },
    ],
    source: "rule-based-mock",
  },
};

describe("AnalyticsProPage", () => {
  beforeEach(() => {
    mocks.post.mockReset();
  });

  it("renders i18n title (Korean locale, no key fallback)", () => {
    render(wrap(<AnalyticsProPage />));
    expect(screen.getByText("강의별 학습 분석 (PRO)")).toBeTruthy();
    expect(screen.getByText("분석 생성")).toBeTruthy();
  });

  it("generates analysis and renders verdict + briefing on success", async () => {
    mocks.post.mockResolvedValueOnce({ data: SAMPLE });
    render(wrap(<AnalyticsProPage />));

    await act(async () => {
      fireEvent.click(screen.getByText("분석 생성"));
    });

    await waitFor(() => {
      expect(screen.getByText("이번 영상은 전반적으로 우수합니다.")).toBeTruthy();
    });
    // KPI: 평균 이해도 82%
    expect(screen.getByText("82%")).toBeTruthy();
    // AI 브리핑 제목
    expect(screen.getByText("심화 문제풀이")).toBeTruthy();
    // 폴백 소스 배지
    expect(screen.getByText("규칙 기반")).toBeTruthy();
  });

  it("shows gated panel (not error toast) on 403", async () => {
    mocks.post.mockRejectedValueOnce({ response: { status: 403 } });
    render(wrap(<AnalyticsProPage />));

    await act(async () => {
      fireEvent.click(screen.getByText("분석 생성"));
    });

    await waitFor(() => {
      expect(
        screen.getByText("학습 분석 PRO 베타 권한이 필요합니다")
      ).toBeTruthy();
    });
  });
});
