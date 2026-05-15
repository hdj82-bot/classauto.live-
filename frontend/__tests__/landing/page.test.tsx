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
  // v2 회귀 (후속 정리 ③): v1 의 Hero "AI로 만드는 / 인터랙티브 플립드 러닝"
  // + Features 6 + Steps 3 + "지금 바로 시작하세요" CTA 구조는 v3.1 짧은
  // 게이트웨이(hero + 분야 카드만)로 전면 교체됐다. v2 의 실제 hero/필드
  // 카피·구조를 회귀 가드한다.
  it("v2 hero + 분야 쇼케이스 카피·카드가 정상 마운트된다", () => {
    renderPage(<LandingPage />);
    // homeHero — / 전용 카피 (헤딩 level 1)
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toContain("학생과 상호작용하는");
    expect(h1.textContent).toContain("AI 교육영상");
    // 관찰자 eyebrow (landingHub.heroV3.observerBadge)
    expect(
      screen.getByText(/교수자의 의도가 모든 결정에 반영되는 AI 강의 플랫폼/),
    ).toBeTruthy();
    // 분야 쇼케이스 헤딩 + 카드 2장
    expect(screen.getByText("두 분야 중 하나를 골라주세요")).toBeTruthy();
    expect(screen.getByTestId("demo-field-social")).toBeTruthy();
    expect(screen.getByTestId("demo-field-natural")).toBeTruthy();
    // v1 시그니처 카피는 회귀하지 않아야 한다
    expect(screen.queryByText("인터랙티브 플립드 러닝")).toBeNull();
    expect(screen.queryByText("지금 바로 시작하세요")).toBeNull();
  });

  // 참고: v3.1 에서 제거된 Stats Strip / MeshNetworkVisual 등 deprecated
  // 섹션의 부재는 아래 "v3.1 짧은 게이트웨이 …" 케이스가 negative 어서션으로
  // 이미 회귀 가드한다 → 해당 섹션용 skip 테스트는 재작성 대신 삭제했다
  // (제거된 콘텐츠를 위한 테스트는 존재 의미가 없음).

  // v2 회귀 (후속 정리 ③): v1 의 hero CTA 2개가 /auth/login 으로 가던 구조는
  // 폐기됐다. v3.1 hero 의 primary 는 /demo?field=social (학생 화면 미리보기),
  // secondary 는 /features 다. /auth/login 회귀가 없는지도 함께 가드.
  it("v2 hero CTA — primary=/demo?field=social, secondary=/features", () => {
    renderPage(<LandingPage />);
    const primary = screen.getByTestId("landing-hero-start");
    expect(primary.getAttribute("href")).toBe("/demo?field=social");
    const featureLinks = screen
      .getAllByRole("link")
      .filter((el) => el.getAttribute("href") === "/features");
    expect(featureLinks.length).toBeGreaterThanOrEqual(1);
    const loginLinks = screen
      .getAllByRole("link")
      .filter((el) => el.getAttribute("href") === "/auth/login");
    expect(loginLinks.length).toBe(0);
  });

  it("IconDefs 가 마운트되어 그라데이션 6종 defs 존재 (DOM 안에)", () => {
    const { container } = renderPage(<LandingPage />);
    // grad-violet, grad-electric, grad-cyan, grad-pink, grad-success, grad-warning
    expect(container.querySelector("#grad-violet")).toBeTruthy();
    expect(container.querySelector("#grad-electric")).toBeTruthy();
    expect(container.querySelector("#grad-cyan")).toBeTruthy();
    expect(container.querySelector("#grad-pink")).toBeTruthy();
  });

  // (MeshNetworkVisual 6-노드 skip 테스트 삭제 — v3.1 에서 컴포넌트 자체가
  // 메인에서 제거됨. 부재 회귀는 바로 아래 케이스의 negative 어서션이 커버.)

  // v3.1 (2026-05-13 PM): 새 구조 — hero + fields 두 섹션만, 그 이후는 모두 제거.
  // 핵심 회귀 가드: 분야 카드 2장이 보이고, 제거되어야 할 섹션이 다시 들어오지
  // 않는지를 함께 검증.
  it("v3.1 짧은 게이트웨이 — hero + fields 만 마운트, 후속 섹션은 없다", () => {
    renderPage(<LandingPage />);
    // hero
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    // 분야 카드 2장 — testid 또는 라벨로 식별 (FieldSelectCard 는 button 또는
    // link 역할로 분야명을 노출한다)
    const headings = screen.getAllByRole("heading", { level: 2 });
    // h2 가 최소 1개 (분야 선택 섹션 헤딩) 존재
    expect(headings.length).toBeGreaterThanOrEqual(1);

    // 제거되어야 할 섹션의 시그니처 텍스트가 없는지 확인 (회귀 가드)
    expect(screen.queryByText("교수자가 이미 사용 중")).toBeNull(); // Stats
    expect(screen.queryByText("시청 완료율")).toBeNull(); // Adoption chart
    expect(screen.queryByText("Q&A 참여")).toBeNull(); // Adoption chart
    // 'PPT' 단일 텍스트는 MeshNetworkVisual 의 노드 라벨. HeroFlowStage 의
    // 'PPT 업로드' 는 별도 텍스트이므로 정확 매칭으로 회귀 가드.
    expect(screen.queryByText("PPT")).toBeNull();
  });
});
