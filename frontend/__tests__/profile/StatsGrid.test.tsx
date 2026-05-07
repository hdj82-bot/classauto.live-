import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StatsGrid from "@/components/student/profile/StatsGrid";
import { I18nProvider } from "@/contexts/I18nContext";

const wrap = (ui: React.ReactNode) =>
  render(<I18nProvider>{ui}</I18nProvider>);

describe("StatsGrid", () => {
  it("renders 5 stat cells", () => {
    wrap(
      <StatsGrid
        stats={{
          watchedMinutes: 90,
          videosCompleted: 3,
          averageAccuracy: 75,
          questionsSent: 12,
          encouragementsReceived: 4,
        }}
      />,
    );
    for (const id of [
      "stat-watch-time",
      "stat-videos-completed",
      "stat-accuracy",
      "stat-questions",
      "stat-encouragements",
    ]) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
  });

  it("formats watch time in hours when >= 60 minutes", () => {
    wrap(
      <StatsGrid
        stats={{
          watchedMinutes: 90,
          videosCompleted: 0,
          averageAccuracy: null,
          questionsSent: 0,
          encouragementsReceived: 0,
        }}
      />,
    );
    expect(screen.getByText("1시간")).toBeTruthy();
  });

  it("formats watch time in minutes when < 60", () => {
    wrap(
      <StatsGrid
        stats={{
          watchedMinutes: 25,
          videosCompleted: 0,
          averageAccuracy: null,
          questionsSent: 0,
          encouragementsReceived: 0,
        }}
      />,
    );
    expect(screen.getByText("25분")).toBeTruthy();
  });

  it("renders dash for accuracy when null (no data)", () => {
    wrap(
      <StatsGrid
        stats={{
          watchedMinutes: 0,
          videosCompleted: 0,
          averageAccuracy: null,
          questionsSent: 0,
          encouragementsReceived: 0,
        }}
      />,
    );
    const accuracy = screen.getByTestId("stat-accuracy");
    expect(accuracy.textContent).toContain("—");
  });
});
