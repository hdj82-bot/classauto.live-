import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { I18nProvider } from "@/contexts/I18nContext";

/**
 * H4 회귀 가드 — 분석 PRO 사이드바 메뉴 노출.
 *
 * 근본 버그: AuthContext 가 JWT 만으로 user 를 만들어 email 이 "" 로 고정돼,
 * canSeeAnalyticsPro(email) 게이트가 항상 닫혀 "분석 PRO" 메뉴가 영구히 사라졌다.
 * /me 보강으로 email 이 채워지면(허용 계정) 메뉴가 다시 노출돼야 한다.
 */

const mocks = vi.hoisted(() => ({ email: null as string | null }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/professor/dashboard",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  // email === null → 비로그인(user 없음). 문자열(""포함)이면 user 존재로 본다
  // (pre-H4 의 email="" 상태를 그대로 표현하기 위함).
  useOptionalAuth: () => ({
    user: mocks.email === null ? null : { email: mocks.email },
  }),
}));

vi.mock("@/lib/professorData", () => ({
  fetchProfessorData: vi.fn().mockResolvedValue({ lectures: [] }),
}));

import ProfessorSidebar from "@/components/professor/shell/Sidebar";

const PRO_LINK = 'a[href="/professor/analytics-pro"]';

const renderSidebar = () =>
  render(
    <I18nProvider>
      <ProfessorSidebar />
    </I18nProvider>,
  );

describe("ProfessorSidebar 분석 PRO 게이트 (H4)", () => {
  beforeEach(() => {
    mocks.email = null;
  });

  it("허용 계정 이메일이면 분석 PRO 메뉴를 노출한다", () => {
    mocks.email = "hdj82@kyonggi.ac.kr";
    const { container } = renderSidebar();
    expect(container.querySelector(PRO_LINK)).not.toBeNull();
  });

  it("허용목록 밖 이메일이면 분석 PRO 메뉴를 숨긴다", () => {
    mocks.email = "someone@other.ac.kr";
    const { container } = renderSidebar();
    expect(container.querySelector(PRO_LINK)).toBeNull();
  });

  it("이메일이 빈 문자열(보강 전 상태)이면 메뉴가 숨겨진다 — 버그 재현 가드", () => {
    mocks.email = ""; // pre-H4: JWT-only user 의 email
    const { container } = renderSidebar();
    expect(container.querySelector(PRO_LINK)).toBeNull();
  });
});
