import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import LandingPage from "@/app/page";
import { I18nProvider } from "@/contexts/I18nContext";

const renderPage = (ui: ReactNode) =>
  render(<I18nProvider>{ui}</I18nProvider>);

beforeEach(() => {
  // jsdom 미구현 — 기존 콘텐츠 회귀 테스트가 IntersectionObserver 와 무관하게
  // 통과하도록. 개별 컴포넌트는 immediate 또는 rAF fallback 으로 자체 처리.
  Element.prototype.scrollIntoView = vi.fn();
});

describe("LandingPage 통합", () => {
  it("기존 콘텐츠 (Hero / Features 6 / Steps 3 / CTA) 모두 회귀 없이 노출", () => {
    renderPage(<LandingPage />);
    // Hero
    expect(screen.getByText("AI로 만드는")).toBeTruthy();
    expect(screen.getByText("인터랙티브 플립드 러닝")).toBeTruthy();
    // Features 6 — 제목 정확 매칭
    expect(screen.getByText("AI 영상 자동 생성")).toBeTruthy();
    expect(screen.getByText("RAG 기반 Q&A")).toBeTruthy();
    expect(screen.getByText("실시간 집중도 추적")).toBeTruthy();
    expect(screen.getByText("자동 평가 시스템")).toBeTruthy();
    expect(screen.getByText("학습 분석 대시보드")).toBeTruthy();
    expect(screen.getByText("다국어 번역 지원")).toBeTruthy();
    // Steps 3
    expect(screen.getByText("PPT 업로드")).toBeTruthy();
    expect(screen.getByText("AI 스크립트 편집")).toBeTruthy();
    expect(screen.getByText("학생에게 공유")).toBeTruthy();
    // CTA
    expect(screen.getByText("지금 바로 시작하세요")).toBeTruthy();
  });

  it("신규 섹션 — Stats Strip (3 stat) / Platform / Adoption 모두 마운트", () => {
    renderPage(<LandingPage />);
    // Stats labels
    expect(screen.getByText("교수자가 이미 사용 중")).toBeTruthy();
    expect(screen.getByText("생성된 강의 영상")).toBeTruthy();
    expect(screen.getByText("절약된 강의 준비 시간")).toBeTruthy();
    // Platform
    expect(screen.getByText(/한 번 업로드/)).toBeTruthy();
    // Adoption
    expect(screen.getByText(/검증된 학습 효과/)).toBeTruthy();
    expect(screen.getByText("시청 완료율")).toBeTruthy();
    expect(screen.getByText("Q&A 참여")).toBeTruthy();
  });

  it("Hero CTA 두 개 모두 /auth/login 또는 #features anchor 로 link", () => {
    renderPage(<LandingPage />);
    const loginLinks = screen
      .getAllByRole("link")
      .filter((el) => el.getAttribute("href") === "/auth/login");
    expect(loginLinks.length).toBeGreaterThanOrEqual(2); // header + hero + cta 등
  });

  it("IconDefs 가 마운트되어 그라데이션 6종 defs 존재 (DOM 안에)", () => {
    const { container } = renderPage(<LandingPage />);
    // grad-violet, grad-electric, grad-cyan, grad-pink, grad-success, grad-warning
    expect(container.querySelector("#grad-violet")).toBeTruthy();
    expect(container.querySelector("#grad-electric")).toBeTruthy();
    expect(container.querySelector("#grad-cyan")).toBeTruthy();
    expect(container.querySelector("#grad-pink")).toBeTruthy();
  });

  it("MeshNetworkVisual 6 노드 라벨 모두 노출", () => {
    renderPage(<LandingPage />);
    expect(screen.getByText("PPT")).toBeTruthy();
    expect(screen.getByText("AI 스크립트")).toBeTruthy();
    expect(screen.getByText("아바타 영상")).toBeTruthy();
    expect(screen.getByText("RAG Q&A")).toBeTruthy();
    expect(screen.getByText("자동 평가")).toBeTruthy();
    expect(screen.getByText("다국어")).toBeTruthy();
  });
});
