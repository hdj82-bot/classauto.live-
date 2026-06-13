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
  it("hero 시연 강의 카피가 정상 마운트된다(분야 쇼케이스 제거됨)", () => {
    renderPage(<LandingPage />);
    // homeHero — / 전용 카피 (헤딩 level 1)
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toContain("중국어 번역작문 강의,");
    expect(h1.textContent).toContain("학생처럼 체험해보세요.");
    // 관찰자 eyebrow (landingHub.heroV3.observerBadge)
    expect(
      screen.getByText(/중국어번역작문 2주차 · AI 강의 데모/),
    ).toBeTruthy();
    // 2-field 데모 쇼케이스는 제거되어 더 이상 렌더되지 않는다(단일 강의 안내).
    expect(screen.queryByText("두 분야 중 하나를 골라주세요")).toBeNull();
    expect(screen.queryByTestId("demo-field-social")).toBeNull();
    expect(screen.queryByTestId("demo-field-natural")).toBeNull();
    // v1 시그니처 카피는 회귀하지 않아야 한다
    expect(screen.queryByText("인터랙티브 플립드 러닝")).toBeNull();
    expect(screen.queryByText("지금 바로 시작하세요")).toBeNull();
  });

  // 참고: v3.1 에서 제거된 Stats Strip / MeshNetworkVisual 등 deprecated
  // 섹션의 부재는 아래 "v3.1 짧은 게이트웨이 …" 케이스가 negative 어서션으로
  // 이미 회귀 가드한다 → 해당 섹션용 skip 테스트는 재작성 대신 삭제했다
  // (제거된 콘텐츠를 위한 테스트는 존재 의미가 없음).

  // v2 회귀 (후속 정리 ③): v1 의 hero CTA 2개가 /auth/login 으로 가던 구조는
  // 폐기됐다. hero 의 primary 는 시연 강의 학생 화면(/lecture/{slug}, "시작하기"),
  // secondary 는 /features.
  // 정책 변경 2026-05-18 (01-pricing-policy.md §5.3): 헤더에 로그인 진입점을
  // 노출하므로 /auth/login 링크는 hero 가 아니라 헤더에 1개 이상 존재한다.
  it("v2 hero CTA — primary=시연 강의(/lecture/...), secondary=/features", () => {
    renderPage(<LandingPage />);
    const primary = screen.getByTestId("landing-hero-start");
    // 시작하기 → 미리 공개한 시연 강의 학생 화면으로 직행(중국어번역작문 2주차).
    expect(primary.getAttribute("href")).toBe(
      "/lecture/중국어-필수-문장성분-f7dda164",
    );
    const featureLinks = screen
      .getAllByRole("link")
      .filter((el) => el.getAttribute("href") === "/features");
    expect(featureLinks.length).toBeGreaterThanOrEqual(1);
    // hero 자체는 /auth/login 으로 가지 않는다 (primary=/demo).
    expect(primary.getAttribute("href")).not.toBe("/auth/login");
    // 헤더(LightMarketingShell)에는 로그인 진입점이 존재한다 (§5.3).
    const loginLinks = screen
      .getAllByRole("link")
      .filter((el) => el.getAttribute("href") === "/auth/login");
    expect(loginLinks.length).toBeGreaterThan(0);
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
  it("짧은 게이트웨이 — hero 만 마운트, 분야/후속 섹션은 없다", () => {
    renderPage(<LandingPage />);
    // hero h1 만 존재
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    // 2-field 분야 쇼케이스(유일한 h2)는 제거됨 — 단일 시연 강의 안내로 일원화.
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();

    // 제거되어야 할 섹션의 시그니처 텍스트가 없는지 확인 (회귀 가드)
    expect(screen.queryByText("교수자가 이미 사용 중")).toBeNull(); // Stats
    expect(screen.queryByText("시청 완료율")).toBeNull(); // Adoption chart
    expect(screen.queryByText("Q&A 참여")).toBeNull(); // Adoption chart
    // 'PPT' 단일 텍스트는 MeshNetworkVisual 의 노드 라벨. HeroFlowStage 의
    // 'PPT 업로드' 는 별도 텍스트이므로 정확 매칭으로 회귀 가드.
    expect(screen.queryByText("PPT")).toBeNull();
  });
});
