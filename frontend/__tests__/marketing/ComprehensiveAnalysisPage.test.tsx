import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "@/contexts/I18nContext";
import ComprehensiveAnalysisPage from "@/app/comprehensive-analysis/page";

// LightMarketingShell 이 effect 에서 window.matchMedia / IntersectionObserver 를
// 쓰므로 jsdom 에 없는 두 API 를 mock 한다(다른 마케팅 페이지 테스트와 동일 패턴).
class MockIO {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

beforeEach(() => {
  Object.defineProperty(window, "IntersectionObserver", {
    writable: true,
    configurable: true,
    value: MockIO,
  });
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((q: string) => ({
      matches: false,
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    })),
  });
});

const renderPage = (ui: ReactNode) => render(<I18nProvider>{ui}</I18nProvider>);

describe("ComprehensiveAnalysisPage — 종합분석 쇼케이스", () => {
  it("renders hero + B블록 섹션 제목 (ko default, no key fallback)", () => {
    renderPage(<ComprehensiveAnalysisPage />);
    expect(screen.getByText("학기 전체를, 한 장의 보고서로")).toBeTruthy();
    expect(screen.getByText("주차별 학습효율 추이")).toBeTruthy();
    expect(screen.getByText("학기말 설문 자동생성")).toBeTruthy();
    expect(screen.getByText("학기 총평")).toBeTruthy();
  });

  it("renders the nav label 종합분석 from LightMarketingShell", () => {
    renderPage(<ComprehensiveAnalysisPage />);
    // 데스크톱 + 모바일 nav 둘 다 렌더되므로 최소 1개 이상.
    expect(screen.getAllByText("종합분석").length).toBeGreaterThan(0);
  });

  it("shows the instructor-review warning (DOI 검증 경고)", () => {
    renderPage(<ComprehensiveAnalysisPage />);
    expect(
      screen.getByText(/AI 생성물은 반드시 교수자 검토가 필요/)
    ).toBeTruthy();
  });
});
