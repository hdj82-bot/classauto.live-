import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { I18nProvider } from "@/contexts/I18nContext";
import { ToastProvider } from "@/components/ui/Toast";
import ComprehensiveReportPage from "@/app/professor/analytics/[lectureId]/comprehensive/page";

const mocks = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock("@/lib/api", () => ({ api: { post: mocks.post } }));
vi.mock("next/navigation", () => ({ useParams: () => ({ lectureId: "lec-1" }) }));

const wrap = (ui: React.ReactNode) => (
  <I18nProvider>
    <ToastProvider>{ui}</ToastProvider>
  </I18nProvider>
);

const TREND = {
  weeks: [
    { week: 1, completion_rate: 58, avg_understanding: 55, engagement: 40 },
    { week: 2, completion_rate: 90, avg_understanding: 83, engagement: 80 },
  ],
  completion_delta: 32,
  understanding_delta: 28,
  engagement_delta: 40,
  timeline: { semester_weeks: 16, current_week: 14, trigger_week: 10, deadline_week: 15, is_open: true, is_past_deadline: false },
};
const SURVEY = {
  survey: {
    warning: "⚠️ AI 생성물은 반드시 교수자 검토가 필요합니다.",
    questions: [
      { no: 1, text: "사전학습 영상이 도움이 되었다.", scale: "5점 리커트", rationale: "플립러닝 인식 측정.", reference: { citation: "Bishop (2013).", doi: "" } },
    ],
    source: "rule-based-mock",
  },
  responses: [{ no: 1, text: "사전학습 영상이 도움이 되었다.", dist: [1, 2, 6, 12, 9], average: 3.9 }],
};
const REVIEW = {
  overview: "한 학기 동안 지표가 상승했습니다.",
  theory_lens: "플립러닝 · 인지부하",
  strengths: ["완주율 상승"],
  weaknesses: ["자기효능감 보강 필요"],
  improvements: ["보충 영상"],
  paper_suggestions: [{ title: "플립러닝 효과 연구", direction: "추이를 효과로 주장", method: "사전-사후" }],
  source: "rule-based-mock",
};

function mockAll() {
  mocks.post.mockImplementation((url: string) => {
    if (url.endsWith("/trend")) return Promise.resolve({ data: TREND });
    if (url.endsWith("/survey")) return Promise.resolve({ data: SURVEY });
    if (url.endsWith("/review")) return Promise.resolve({ data: REVIEW });
    return Promise.resolve({ data: {} });
  });
}

async function fillAndGenerate() {
  fireEvent.change(screen.getByLabelText("과목"), { target: { value: "유체역학" } });
  fireEvent.change(screen.getByLabelText("분야"), { target: { value: "공학" } });
  fireEvent.change(screen.getByLabelText("취약 개념 축 (쉼표로 구분)"), { target: { value: "오개념, 공식 적용 오류" } });
  await act(async () => {
    fireEvent.click(screen.getByText("종합보고서 생성"));
  });
}

describe("ComprehensiveReportPage", () => {
  beforeEach(() => {
    mocks.post.mockReset();
  });

  it("renders title and form (ko)", () => {
    render(wrap(<ComprehensiveReportPage />));
    expect(screen.getByText("학기 종합보고서")).toBeTruthy();
    expect(screen.getByText("종합보고서 생성")).toBeTruthy();
  });

  it("generates and renders trend + survey + review", async () => {
    mockAll();
    render(wrap(<ComprehensiveReportPage />));
    await fillAndGenerate();
    await waitFor(() => screen.getByText("한 학기 동안 지표가 상승했습니다."));
    expect(screen.getByText(/AI 생성물은 반드시 교수자 검토/)).toBeTruthy();
    expect(screen.getByText("플립러닝 효과 연구")).toBeTruthy();
    // 3개 엔드포인트 호출.
    expect(mocks.post).toHaveBeenCalledTimes(3);
  });

  it("shows gated panel on 403", async () => {
    mocks.post.mockRejectedValue({ response: { status: 403 } });
    render(wrap(<ComprehensiveReportPage />));
    await fillAndGenerate();
    await waitFor(() => {
      expect(screen.getByText("학습 분석 PRO 베타 권한이 필요합니다")).toBeTruthy();
    });
  });
});
