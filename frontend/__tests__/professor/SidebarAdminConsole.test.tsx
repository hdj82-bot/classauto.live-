import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/contexts/I18nContext";

/**
 * 스펙 14 §E — 교수자 셸의 운영자 콘솔 진입점.
 *
 * 종전 항목은 `/owner/invites` 를 직접 가리켰다. §A 에서 그 경로가 `/admin/invites`
 * 로 redirect 되게 바뀌면서 (1) 리다이렉트를 한 번 타고 (2) 초대 화면 하나만 열려
 * 나머지 콘솔 8개 화면은 계정주가 주소를 외워야 했다. `/admin` 으로 보낸다.
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
  useOptionalAuth: () => ({
    user: mocks.email === null ? null : { email: mocks.email },
  }),
}));

vi.mock("@/lib/professorData", () => ({
  fetchProfessorData: vi.fn().mockResolvedValue({ lectures: [] }),
}));

import ProfessorSidebar from "@/components/professor/shell/Sidebar";

const CONSOLE_LINK = 'a[href="/admin"]';

const renderSidebar = () =>
  render(
    <I18nProvider>
      <ProfessorSidebar />
    </I18nProvider>,
  );

describe("ProfessorSidebar 운영자 콘솔 진입점 (스펙 14 §E)", () => {
  beforeEach(() => {
    mocks.email = null;
  });

  it("계정주 이메일이면 /admin 진입점을 노출한다", () => {
    mocks.email = "classauto101@gmail.com";
    const { container } = renderSidebar();
    expect(container.querySelector(CONSOLE_LINK)).not.toBeNull();
    expect(screen.getByText("운영자 콘솔")).toBeTruthy();
  });

  it("구 경로 /owner/invites 를 가리키지 않는다 — 리다이렉트를 한 번 타게 된다", () => {
    mocks.email = "classauto101@gmail.com";
    const { container } = renderSidebar();
    expect(container.querySelector('a[href="/owner/invites"]')).toBeNull();
  });

  it("베타테스터(허용목록 밖)에게는 숨긴다", () => {
    mocks.email = "someone@other.ac.kr";
    const { container } = renderSidebar();
    expect(container.querySelector(CONSOLE_LINK)).toBeNull();
  });

  it("이메일이 빈 문자열이면 숨긴다(H4 회귀 가드와 같은 조건)", () => {
    mocks.email = "";
    const { container } = renderSidebar();
    expect(container.querySelector(CONSOLE_LINK)).toBeNull();
  });

  it("비로그인이면 숨긴다", () => {
    const { container } = renderSidebar();
    expect(container.querySelector(CONSOLE_LINK)).toBeNull();
  });
});
