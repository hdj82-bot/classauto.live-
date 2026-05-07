import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/contexts/I18nContext";
import CostMeter from "@/components/professor/analytics/CostMeter";
import type { CostData } from "@/components/professor/analytics/types";

const wrap = (ui: React.ReactNode) => (
  <I18nProvider>{ui}</I18nProvider>
);

describe("CostMeter", () => {
  it("renders empty state when no cost has been logged", () => {
    const data: CostData = {
      lecture_id: "L1",
      summary: {
        totalRequests: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCostUsd: 0,
      },
      byCategory: [],
    };
    render(wrap(<CostMeter data={data} />));
    expect(screen.getByText("아직 비용 발생 기록이 없습니다.")).toBeTruthy();
  });

  it("renders total cost, token stats, and per-category breakdown", () => {
    const data: CostData = {
      lecture_id: "L1",
      summary: {
        totalRequests: 12,
        totalInputTokens: 12345,
        totalOutputTokens: 6789,
        totalCostUsd: 4.56,
      },
      byCategory: [
        {
          category: "tts",
          inputTokens: 1000,
          outputTokens: 0,
          costUsd: 2.1,
          count: 6,
        },
        {
          category: "avatar",
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 2.46,
          count: 6,
        },
      ],
    };
    render(wrap(<CostMeter data={data} />));
    expect(screen.getByText("$4.5600")).toBeTruthy();
    // 입력 토큰 12,345 가 locale string 으로 표시됨 (ko-KR/en-US 모두 콤마)
    expect(screen.getByText("12,345")).toBeTruthy();
    expect(screen.getByText("tts")).toBeTruthy();
    expect(screen.getByText("avatar")).toBeTruthy();
  });

  it("activates the 80% warning when total exceeds the monthly limit threshold", () => {
    const data: CostData = {
      lecture_id: "L1",
      summary: {
        totalRequests: 100,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCostUsd: 17,
      },
      byCategory: [
        { category: "tts", inputTokens: 0, outputTokens: 0, costUsd: 17, count: 100 },
      ],
    };
    render(wrap(<CostMeter data={data} monthlyLimitUsd={20} />));
    // 80% 경고 카피 노출 (i18n)
    expect(screen.getByText(/한도의 80%/)).toBeTruthy();
  });
});
