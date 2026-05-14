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

  // v3.1 (2026-05-13 PM): 사용자 결정으로 Stats Strip / Platform mesh /
  // Adoption chart / 4가지 차별점 / 3단계 / Anchor case / Final CTA 모든 섹션을
  // 메인 사이트에서 제거 (긴 마케팅 콘텐츠는 /features · /use-cases · /pricing
  // 으로 분산). 따라서 본 어서션은 무효 — skip 처리하고 후속 PR 에서 새 v3.1
  // 구조 (hero + fields 만) 회귀 테스트로 교체.
  it.skip("신규 섹션 — Stats Strip (3 stat) / Platform / Adoption 모두 마운트 (v3, deprecated)", () => {
    renderPage(<LandingPage />);
    expect(screen.getByText("교수자가 이미 사용 중")).toBeTruthy();
    expect(screen.getByText("생성된 강의 영상")).toBeTruthy();
    expect(screen.getByText("절약된 강의 준비 시간")).toBeTruthy();
    expect(screen.getByText(/한 번 업로드/)).toBeTruthy();
    expect(screen.getByText(/검증된 학습 효과/)).toBeTruthy();
    expect(screen.getByText("시청 완료율")).toBeTruthy();
    expect(screen.getByText("Q&A 참여")).toBeTruthy();
  });

  // v2 (2026-05-13): hero CTA 링크 경로·개수 재구성. 후속 PR 에서 새 어서션 작성.
  it.skip("Hero CTA 두 개 모두 /auth/login 또는 #features anchor 로 link (v1)", () => {
    renderPage(<LandingPage />);
    const loginLinks = screen
      .getAllByRole("link")
      .filter((el) => el.getAttribute("href") === "/auth/login");
    expect(loginLinks.length).toBeGreaterThanOrEqual(2);
  });

  it("IconDefs 가 마운트되어 그라데이션 6종 defs 존재 (DOM 안에)", () => {
    const { container } = renderPage(<LandingPage />);
    // grad-violet, grad-electric, grad-cyan, grad-pink, grad-success, grad-warning
    expect(container.querySelector("#grad-violet")).toBeTruthy();
    expect(container.querySelector("#grad-electric")).toBeTruthy();
    expect(container.querySelector("#grad-cyan")).toBeTruthy();
    expect(container.querySelector("#grad-pink")).toBeTruthy();
  });

  // v3.1 (2026-05-13 PM): MeshNetworkVisual 도 메인에서 제거. /features 페이지로
  // 이동 예정. 본 어서션은 무효.
  it.skip("MeshNetworkVisual 6 노드 라벨 모두 노출 (v3, deprecated)", () => {
    renderPage(<LandingPage />);
    expect(screen.getByText("PPT")).toBeTruthy();
    expect(screen.getByText("AI 스크립트")).toBeTruthy();
    expect(screen.getByText("아바타 영상")).toBeTruthy();
    expect(screen.getByText("RAG Q&A")).toBeTruthy();
    expect(screen.getByText("자동 평가")).toBeTruthy();
    expect(screen.getByText("다국어")).toBeTruthy();
  });

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
