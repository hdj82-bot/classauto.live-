import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import LandingPage from "@/app/page";
import { I18nProvider } from "@/contexts/I18nContext";

const renderWithI18n = (ui: ReactNode) => render(<I18nProvider>{ui}</I18nProvider>);

describe("LandingPage", () => {
  it("renders hero heading", () => {
    renderWithI18n(<LandingPage />);
    expect(screen.getByText("인터랙티브 플립드 러닝")).toBeTruthy();
  });

  it("renders CTA button", () => {
    renderWithI18n(<LandingPage />);
    const buttons = screen.getAllByText("무료로 시작하기");
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it("renders 6 feature cards", () => {
    renderWithI18n(<LandingPage />);
    expect(screen.getByText("AI 영상 자동 생성")).toBeTruthy();
    expect(screen.getByText("RAG 기반 Q&A")).toBeTruthy();
    expect(screen.getByText("실시간 집중도 추적")).toBeTruthy();
    expect(screen.getByText("자동 평가 시스템")).toBeTruthy();
    expect(screen.getByText("학습 분석 대시보드")).toBeTruthy();
    expect(screen.getByText("다국어 번역 지원")).toBeTruthy();
  });

  it("renders 3-step flow", () => {
    renderWithI18n(<LandingPage />);
    expect(screen.getByText("PPT 업로드")).toBeTruthy();
    expect(screen.getByText("AI 스크립트 편집")).toBeTruthy();
    expect(screen.getByText("학생에게 공유")).toBeTruthy();
  });

  it("renders footer", () => {
    renderWithI18n(<LandingPage />);
    expect(screen.getByText(/All rights reserved/)).toBeTruthy();
  });

  it("renders navigation with login link", () => {
    renderWithI18n(<LandingPage />);
    const links = document.querySelectorAll('a[href="/auth/login"]');
    expect(links.length).toBeGreaterThanOrEqual(1);
  });
});
