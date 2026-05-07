import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/contexts/I18nContext";
import AttendanceChart from "@/components/professor/analytics/AttendanceChart";
import type { AttendanceData } from "@/components/professor/analytics/types";

const wrap = (ui: React.ReactNode) => (
  <I18nProvider>{ui}</I18nProvider>
);

describe("AttendanceChart", () => {
  it("renders empty state when no students attended", () => {
    const data: AttendanceData = {
      lecture_id: "L1",
      summary: { total: 0, live: 0, vod: 0 },
      students: [],
    };
    render(wrap(<AttendanceChart data={data} />));
    // EmptyState 가 진입 안내 카피를 노출
    expect(screen.getByText("아직 출석 기록이 없습니다.")).toBeTruthy();
  });

  it("renders summary tiles + bar with live/vod counts", () => {
    const data: AttendanceData = {
      lecture_id: "L1",
      summary: { total: 10, live: 6, vod: 4 },
      students: [
        {
          user_id: "u1",
          name: "학생1",
          student_number: "2024001",
          type: "live",
          started_at: null,
          progress_pct: 90,
          status: "completed",
        },
        {
          user_id: "u2",
          name: "학생2",
          student_number: "2024002",
          type: "vod",
          started_at: null,
          progress_pct: 30,
          status: "in_progress",
        },
      ],
    };
    const { container } = render(wrap(<AttendanceChart data={data} />));

    // 누적 막대의 ARIA 라벨에 정원·실시간·사후 수치가 모두 포함되는지
    const ariaImg = container.querySelector('[role="img"]');
    expect(ariaImg).toBeTruthy();
    expect(ariaImg?.getAttribute("aria-label")).toContain("10");
    expect(ariaImg?.getAttribute("aria-label")).toContain("6");
    expect(ariaImg?.getAttribute("aria-label")).toContain("4");

    // 진행률 4-bucket 히스토그램 progressbar 가 존재
    const bars = container.querySelectorAll('[role="progressbar"]');
    expect(bars.length).toBeGreaterThanOrEqual(4);
  });
});
