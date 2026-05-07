import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/contexts/I18nContext";
import QaTrend from "@/components/professor/analytics/QaTrend";
import type { QAData } from "@/components/professor/analytics/types";

const wrap = (ui: React.ReactNode) => (
  <I18nProvider>{ui}</I18nProvider>
);

describe("QaTrend", () => {
  it("renders empty state when no logs are available", () => {
    const data: QAData = {
      lecture_id: "L1",
      page: 1,
      limit: 50,
      totalCount: 0,
      totalPages: 0,
      logs: [],
    };
    render(wrap(<QaTrend data={data} />));
    expect(screen.getByText("Q&A 로그가 아직 없습니다.")).toBeTruthy();
  });

  it("renders summary tiles + sparkline when logs are present", () => {
    const data: QAData = {
      lecture_id: "L1",
      page: 1,
      limit: 50,
      totalCount: 3,
      totalPages: 1,
      logs: [
        {
          id: "1",
          question: "q1",
          answer: "a",
          in_scope: true,
          responded: true,
          cost_usd: 0.01,
          created_at: "2026-05-07T01:00:00Z",
        },
        {
          id: "2",
          question: "q2",
          answer: null,
          in_scope: false,
          responded: false,
          cost_usd: 0,
          created_at: "2026-05-07T02:00:00Z",
        },
        {
          id: "3",
          question: "q3",
          answer: "a",
          in_scope: true,
          responded: true,
          cost_usd: 0.02,
          created_at: "2026-05-07T03:00:00Z",
        },
      ],
    };
    render(wrap(<QaTrend data={data} />));
    // total = 3
    expect(screen.getByText("3")).toBeTruthy();
    // out of scope = 1
    expect(screen.getByText("1")).toBeTruthy();
  });
});
