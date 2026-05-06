import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import UseCasesContent from "@/components/marketing/UseCasesContent";
import { I18nProvider } from "@/contexts/I18nContext";

const wrap = (ui: ReactNode) => render(<I18nProvider>{ui}</I18nProvider>);

describe("UseCasesContent", () => {
  it("renders the hero, the anchor case, and the per-discipline cards", () => {
    wrap(<UseCasesContent />);

    // Hero
    expect(screen.getByText("내 분야에서도 쓸 수 있을까요?")).toBeTruthy();
    // Anchor case
    expect(screen.getByText(/하두진 교수님/)).toBeTruthy();
    // At least three discipline cards
    expect(screen.getByText("사회과학·국제학")).toBeTruthy();
    expect(screen.getByText("인문·문학")).toBeTruthy();
    expect(screen.getByText("공학·이공계")).toBeTruthy();
    // CTA links to /beta-apply and /demo
    const applyLinks = screen.getAllByText(/베타 신청/);
    expect(applyLinks.length).toBeGreaterThan(0);
  });

  it("opens the detail modal when 'View detail' is clicked", () => {
    wrap(<UseCasesContent />);
    // Multiple cards render the same "자세히 보기" — click the first one.
    const detailButtons = screen.getAllByText(/자세히 보기/);
    fireEvent.click(detailButtons[0]);
    // Modal sets role="dialog"
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
