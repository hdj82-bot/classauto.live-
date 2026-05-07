import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/contexts/I18nContext";
import ScoreHeatmap from "@/components/professor/analytics/ScoreHeatmap";
import type { ScoresData } from "@/components/professor/analytics/types";

const wrap = (ui: React.ReactNode) => (
  <I18nProvider>{ui}</I18nProvider>
);

describe("ScoreHeatmap", () => {
  it("renders empty state when no questions answered", () => {
    const data: ScoresData = {
      lecture_id: "L1",
      totalQuestions: 0,
      overallAccuracy: 0,
      byType: [],
      byCategory: [],
      wrongAnswerTop: [],
    };
    render(wrap(<ScoreHeatmap data={data} />));
    expect(screen.getByText("아직 문제 응답 데이터가 없습니다.")).toBeTruthy();
  });

  it("renders heatmap cells + overall accuracy + Top wrong list", () => {
    const data: ScoresData = {
      lecture_id: "L1",
      totalQuestions: 30,
      overallAccuracy: 73.33,
      byType: [{ type: "MCQ", total: 30, correct: 22, accuracy: 73.33 }],
      byCategory: [
        { category: "기초", total: 10, correct: 9, accuracy: 90 },
        { category: "응용", total: 10, correct: 5, accuracy: 50 },
        { category: "심화", total: 10, correct: 8, accuracy: 80 },
      ],
      wrongAnswerTop: [
        {
          questionText: "GDP의 정의는?",
          questionType: "MCQ",
          wrongCount: 4,
          wrongAnswers: ["A", "C"],
        },
      ],
    };
    const { container } = render(wrap(<ScoreHeatmap data={data} />));

    // overall accuracy 표시
    expect(screen.getByText("73.3%")).toBeTruthy();

    // SVG 셀이 카테고리 수만큼 그려짐 (rect rx=10)
    const rects = container.querySelectorAll("svg rect[rx='10']");
    expect(rects.length).toBeGreaterThanOrEqual(3);

    // 카테고리 라벨이 SVG 안에 노출 (truncated text + title 두 곳에 동일 텍스트)
    expect(screen.getAllByText("기초").length).toBeGreaterThan(0);

    // 오답 Top 항목
    expect(screen.getByText("GDP의 정의는?")).toBeTruthy();
  });
});
