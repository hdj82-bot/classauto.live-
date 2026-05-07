import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import CostMeter from "@/components/professor/studio/CostMeter";
import { I18nProvider } from "@/contexts/I18nContext";
import type {
  CostBreakdown,
  PlanUsage,
} from "@/components/professor/studio/studioTypes";

const renderWithI18n = (ui: ReactNode) =>
  render(<I18nProvider>{ui}</I18nProvider>);

const baseEstimate: CostBreakdown = {
  ttsChars: 1500,
  ttsCost: 0.45,
  avatarSeconds: 90,
  avatarCost: 1.53,
  total: 1.98,
};

describe("CostMeter", () => {
  it("renders TTS / avatar / total amounts", () => {
    const usage: PlanUsage = { used: 10, limit: 100 };
    renderWithI18n(
      <CostMeter estimate={baseEstimate} usage={usage} ttsProvider="elevenlabs" />,
    );
    expect(screen.getByText("$0.45")).toBeTruthy();
    expect(screen.getByText("$1.53")).toBeTruthy();
    expect(screen.getByText("$1.98")).toBeTruthy();
  });

  it("hides progress bar when limit=0 (unlimited / Pro)", () => {
    const usage: PlanUsage = { used: 0, limit: 0 };
    renderWithI18n(
      <CostMeter estimate={baseEstimate} usage={usage} ttsProvider="elevenlabs" />,
    );
    // role=progressbar 가 존재하지 않아야 한다.
    const bars = screen.queryAllByRole("progressbar");
    expect(bars.length).toBe(0);
  });

  it("shows warn copy when usage + estimate hits 80% threshold", () => {
    const usage: PlanUsage = { used: 79, limit: 100 };
    renderWithI18n(
      <CostMeter estimate={baseEstimate} usage={usage} ttsProvider="elevenlabs" />,
    );
    expect(screen.getByText(/80%를 초과/)).toBeTruthy();
  });

  it("shows blocked alert role when limit exceeded", () => {
    const usage: PlanUsage = { used: 99, limit: 100 };
    renderWithI18n(
      <CostMeter estimate={baseEstimate} usage={usage} ttsProvider="elevenlabs" />,
    );
    const alerts = screen.queryAllByRole("alert");
    expect(alerts.length).toBeGreaterThan(0);
    expect(screen.getByText(/한도를 초과/)).toBeTruthy();
  });

  it("does not warn for small usage well under threshold", () => {
    const usage: PlanUsage = { used: 5, limit: 100 };
    renderWithI18n(
      <CostMeter estimate={baseEstimate} usage={usage} ttsProvider="elevenlabs" />,
    );
    expect(screen.queryByText(/80%를 초과/)).toBeNull();
    expect(screen.queryByText(/한도를 초과/)).toBeNull();
  });

  it("exposes progressbar with aria-valuenow proportional to usage", () => {
    const usage: PlanUsage = { used: 50, limit: 100 };
    renderWithI18n(
      <CostMeter estimate={baseEstimate} usage={usage} ttsProvider="elevenlabs" />,
    );
    const bar = screen.getByRole("progressbar");
    const value = Number(bar.getAttribute("aria-valuenow"));
    // (50 + 1.98) / 100 ≈ 51.98 → rounded to 52
    expect(value).toBeGreaterThanOrEqual(50);
    expect(value).toBeLessThanOrEqual(53);
  });
});
