import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import LimitsTable from "@/components/pricing/LimitsTable";
import { I18nProvider } from "@/contexts/I18nContext";

const wrap = (ui: React.ReactNode) =>
  render(<I18nProvider>{ui}</I18nProvider>);

describe("LimitsTable", () => {
  it("renders 6 rows × 3 plan columns", () => {
    wrap(<LimitsTable />);
    for (const row of [
      "perEpisodeQa",
      "dailyQa",
      "monthlyQa",
      "inputChars",
      "concurrent24h",
      "concurrentPlay",
    ]) {
      expect(screen.getByTestId(`limits-row-${row}`)).toBeTruthy();
    }
    for (const plan of ["free", "basic", "pro"]) {
      expect(screen.getByTestId(`limits-col-${plan}`)).toBeTruthy();
    }
  });

  it("renders each cell with the exact value from the patch (matrix lint)", () => {
    wrap(<LimitsTable />);
    const expected: Record<string, Record<string, string>> = {
      free: {
        perEpisodeQa: "20건",
        dailyQa: "—",
        monthlyQa: "—",
        inputChars: "500자",
        concurrent24h: "30명",
        concurrentPlay: "1개",
      },
      basic: {
        perEpisodeQa: "100건",
        dailyQa: "30건",
        monthlyQa: "500건",
        inputChars: "500자",
        concurrent24h: "80명",
        concurrentPlay: "1개",
      },
      pro: {
        perEpisodeQa: "무제한",
        dailyQa: "100건",
        monthlyQa: "2,000건",
        inputChars: "500자",
        concurrent24h: "무제한",
        concurrentPlay: "1개",
      },
    };
    for (const [plan, rows] of Object.entries(expected)) {
      for (const [row, value] of Object.entries(rows)) {
        const cell = screen.getByTestId(`limits-cell-${plan}-${row}`);
        expect(
          cell.textContent?.trim(),
          `${plan}.${row} should be "${value}"`,
        ).toBe(value);
      }
    }
  });
});
