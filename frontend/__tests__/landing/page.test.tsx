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

describe("LandingPage 통합 (v3.1)", () => {
  // v2 (2026-05-13): 본문 카피·구조 재작성으로 무효. 후속 PR 에서 v2 hero/feature 어서션 재작성.
  it.skip("기존 콘텐츠 (Hero / Features 6 / Steps 3 / CTA) 모두 회귀 없이 노출 (v1)", () => {
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

  // v3.1 (2026-05-13): 사용자 결정으로 Stats / Differentiators / Platform mesh /
  // Steps / Adoption / Anchor / Final CTA 섹션 전부 삭제 — `/` 는 standalone
  // hero + 분야 카드 + Trust strip 만 노출.
  it("v3.1 — 한자 강조 hero 및 삭제된 섹션 콘텐츠 부재", () => {
    renderPage(<LandingPage />);
    // 폐기된 한자 강조 hero
    expect(screen.queryByText("INTERACTIVE FLIPPED LEARNING")).toBeNull();
    expect(screen.queryByText("학자가 학자를 위해 만든 도구")).toBeNull();
    // 폐기된 Stats / Platform / Adoption 라벨
    expect(screen.queryByText("교수자가 이미 사용 중")).toBeNull();
    expect(screen.queryByText("절약된 강의 준비 시간")).toBeNull();
    expect(screen.queryByText("시청 완료율")).toBeNull();
    expect(screen.queryByText("Q&A 참여")).toBeNull();
    // 폐기된 IconDefs (기존 #grad-violet 등) — 새 GradientDefs 는 #ca-grad-* 사용
    const { container } = renderPage(<LandingPage />);
    expect(container.querySelector("#grad-violet")).toBeNull();
    expect(container.querySelector("#grad-success")).toBeNull();
  });

  it("v3.1 — standalone hero 카피 + 2개 분야 카드 + 4-cell Trust strip 마운트", () => {
    renderPage(<LandingPage />);
    // Hero
    expect(screen.getByText("AI 강의 자동 생성 플랫폼")).toBeTruthy();
    expect(screen.getByText(/대본 한 번/)).toBeTruthy();
    expect(screen.getByText("끝없는 대화")).toBeTruthy();
    expect(screen.getByText("학생이 만나는 화면을 먼저 확인해보세요.")).toBeTruthy();
    // Hero CTA — /demo 로 deep-link
    const primary = screen.getByTestId("landing-hero-start");
    expect(primary).toBeTruthy();
    expect(primary.getAttribute("href")).toBe("/demo");
    // 분야 카드 — social + natural 두 장
    expect(screen.getByText("두 분야 중 하나를 골라주세요")).toBeTruthy();
    expect(screen.getByTestId("demo-field-social")).toBeTruthy();
    expect(screen.getByTestId("demo-field-natural")).toBeTruthy();
    // Trust strip — 4-cell
    expect(screen.getByText("데이터 보호")).toBeTruthy();
    expect(screen.getByText("24시간 후 자동 삭제")).toBeTruthy();
    expect(screen.getByText("RAG 임계값")).toBeTruthy();
    expect(screen.getByText("0.65 · 체험용 완화")).toBeTruthy();
    expect(screen.getByText("입력 한도")).toBeTruthy();
    expect(screen.getByText("세션 관리")).toBeTruthy();
  });

  it("v3.1 — GradientDefs 의 6종 ca-grad-* 정의 존재", () => {
    const { container } = renderPage(<LandingPage />);
    expect(container.querySelector("#ca-grad-violet")).toBeTruthy();
    expect(container.querySelector("#ca-grad-electric")).toBeTruthy();
    expect(container.querySelector("#ca-grad-cyan")).toBeTruthy();
    expect(container.querySelector("#ca-grad-pink")).toBeTruthy();
    expect(container.querySelector("#ca-grad-globe")).toBeTruthy();
    expect(container.querySelector("#ca-grad-atom")).toBeTruthy();
  });

  // v2 (2026-05-13): hero CTA 링크 경로·개수 재구성. 후속 PR 에서 새 어서션 작성.
  it.skip("Hero CTA 두 개 모두 /auth/login 또는 #features anchor 로 link (v1)", () => {
    renderPage(<LandingPage />);
    const loginLinks = screen
      .getAllByRole("link")
      .filter((el) => el.getAttribute("href") === "/auth/login");
    expect(loginLinks.length).toBeGreaterThanOrEqual(2);
  });
});
