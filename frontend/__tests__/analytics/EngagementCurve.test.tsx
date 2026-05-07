import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/contexts/I18nContext";
import EngagementCurve from "@/components/professor/analytics/EngagementCurve";
import type { EngagementData } from "@/components/professor/analytics/types";

const wrap = (ui: React.ReactNode) => (
  <I18nProvider>{ui}</I18nProvider>
);

describe("EngagementCurve", () => {
  it("renders empty state when there are no engagement records", () => {
    const data: EngagementData = {
      lecture_id: "L1",
      summary: {
        totalStudents: 0,
        totalQAQuestions: 0,
        overallResponseRate: 0,
        totalNoResponseEvents: 0,
      },
      students: [],
    };
    render(wrap(<EngagementCurve data={data} />));
    expect(screen.getByText("아직 참여 기록이 없습니다.")).toBeTruthy();
  });

  it("renders summary tiles + 5-bin curve + per-student table", () => {
    const data: EngagementData = {
      lecture_id: "L1",
      summary: {
        totalStudents: 4,
        totalQAQuestions: 7,
        overallResponseRate: 86,
        totalNoResponseEvents: 2,
      },
      students: [
        {
          userId: "u1",
          name: "A",
          student_number: "1",
          qaCount: 2,
          respondedCount: 2,
          noResponseCnt: 0,
          watchedSec: 100,
          totalSec: 100,
          watchRatio: 100,
          responseRate: 100,
        },
        {
          userId: "u2",
          name: "B",
          student_number: "2",
          qaCount: 3,
          respondedCount: 2,
          noResponseCnt: 1,
          watchedSec: 50,
          totalSec: 100,
          watchRatio: 50,
          responseRate: 66.66,
        },
        {
          userId: "u3",
          name: "C",
          student_number: "3",
          qaCount: 0,
          respondedCount: 0,
          noResponseCnt: 1,
          watchedSec: 5,
          totalSec: 100,
          watchRatio: 5,
          responseRate: null,
        },
      ],
    };
    render(wrap(<EngagementCurve data={data} />));

    // summary tile 들
    expect(screen.getByText("86%")).toBeTruthy(); // 응답률 카드
    expect(screen.getByText("A")).toBeTruthy(); // 표 1행

    // SVG curve 가 그려짐 (`role="img"` 가 적어도 1개)
    const imgs = document.querySelectorAll('[role="img"]');
    expect(imgs.length).toBeGreaterThan(0);
  });
});
