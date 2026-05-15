import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import DemoPage from "@/app/demo/page";
import { I18nProvider } from "@/contexts/I18nContext";
import { ToastProvider } from "@/components/ui/Toast";

const renderPage = (ui: ReactNode) =>
  render(
    <I18nProvider>
      <ToastProvider>{ui}</ToastProvider>
    </I18nProvider>,
  );

beforeEach(() => {
  // /demo 페이지의 DemoVideo 컴포넌트가 fetch HEAD 로 영상 존재 확인
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;
  // scrollIntoView 는 jsdom 미구현
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DemoPage", () => {
  // v2 회귀 (후속 정리 ③): v1 "30초만 학생이 되어보세요" hero 는 v2 에서
  // 관찰자 시점 hero(heroV3)로 전면 교체됐다. DEPLOYMENT_PROGRESS 가 인용한
  // PR #113 본문 카피("강의 영상이 학생에게 답합니다")는 PR 작성 시점 문구로,
  // 이후 사용자 결정(2026-05-13 PM)으로 heroV3 카피로 정착했다. 테스트는 PR
  // 산문이 아니라 실제 렌더 DOM(현재 소스의 heroV3 i18n)을 기준으로 한다.
  it("renders the v2 observer hero (heroV3) and drops the v1 '30초' copy", () => {
    renderPage(<DemoPage />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toContain("학생과 상호작용하는");
    expect(h1.textContent).toContain("AI 교육영상");
    // 관찰자 eyebrow 배지
    expect(screen.getByText(/AI 강의 자동 생성 플랫폼/)).toBeTruthy();
    // v1 카피는 더 이상 없어야 한다 (회귀 가드)
    expect(screen.queryByText(/30초만 학생이 되어보세요/)).toBeNull();
  });

  it("starts on field selection and surfaces both demo cards", () => {
    renderPage(<DemoPage />);
    expect(screen.getByTestId("demo-field-social")).toBeTruthy();
    expect(screen.getByTestId("demo-field-natural")).toBeTruthy();
  });

  it("transitions into the experience view after picking a field", () => {
    renderPage(<DemoPage />);
    fireEvent.click(screen.getByTestId("demo-field-social"));
    // 체험 영역의 식별 가능한 요소들이 노출되어야 한다
    expect(screen.getByTestId("demo-status-bar")).toBeTruthy();
    expect(screen.getByTestId("demo-questions-counter")).toBeTruthy();
    expect(screen.getByTestId("demo-input")).toBeTruthy();
  });

  it("renders the footer beta CTA pointing at /beta-apply", () => {
    renderPage(<DemoPage />);
    const cta = screen.getByTestId("demo-footer-beta-cta") as HTMLAnchorElement;
    expect(cta.getAttribute("href")).toBe("/beta-apply");
  });

  // v3.2 (2026-05-13 PM): "회원가입 없이 정말 다 써볼 수 있나요?" 어서션 제거.
  // 사용자 결정으로 q1 항목이 화면에서 빠짐 (실제 데모 진입이 회원가입을
  // 요구하는 상황과 어긋나는 카피였음). i18n 키 자체는 보존하지만 화면 렌더
  // 회귀 테스트는 q2~q4 만 검증한다.
  it("renders the demo-only FAQ section with three questions (q1 deprecated)", () => {
    renderPage(<DemoPage />);
    expect(screen.queryByText(/회원가입 없이 정말 다 써볼 수 있나요/)).toBeNull();
    expect(screen.getByText(/내 강의로도 이런 영상이 만들어지나요/)).toBeTruthy();
    expect(screen.getByText(/학생 입장 화면이 실제와 같나요/)).toBeTruthy();
    expect(screen.getByText(/두 데모 영상 모두 체험할 수 있나요/)).toBeTruthy();
  });
});
