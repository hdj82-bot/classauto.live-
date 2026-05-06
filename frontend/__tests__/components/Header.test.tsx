import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Header from "@/components/Header";
import { I18nProvider } from "@/contexts/I18nContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { tokens } from "@/lib/tokens";

// next/navigation — usePathname 만 사용
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

const renderHeader = () =>
  render(
    <AuthProvider>
      <I18nProvider>
        <Header />
      </I18nProvider>
    </AuthProvider>,
  );

beforeEach(() => {
  tokens.clear();
  localStorage.clear();
});

/**
 * R2W1: 비로그인 사용자도 모바일에서 /demo, /pricing 진입 가능해야 한다.
 * 기존엔 햄버거 자체가 `{user && (...)}` 안에 있어 비로그인 시 모바일 메뉴가 없었다.
 */
describe("Header — mobile public access (R2W1)", () => {
  it("logged-out 사용자도 모바일 햄버거 버튼이 노출된다", () => {
    renderHeader();
    expect(screen.getByTestId("header-mobile-toggle")).toBeTruthy();
  });

  it("기본 상태에서 모바일 드롭다운은 닫혀 있다 (aria-expanded=false)", () => {
    renderHeader();
    const toggle = screen.getByTestId("header-mobile-toggle");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("header-mobile-link-demo")).toBeNull();
  });

  it("햄버거 클릭 시 드롭다운에 /demo, /pricing 링크가 노출된다", () => {
    renderHeader();
    const toggle = screen.getByTestId("header-mobile-toggle");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    const demoLink = screen.getByTestId("header-mobile-link-demo") as HTMLAnchorElement;
    const pricingLink = screen.getByTestId("header-mobile-link-pricing") as HTMLAnchorElement;
    expect(demoLink.getAttribute("href")).toBe("/demo");
    expect(pricingLink.getAttribute("href")).toBe("/pricing");
  });

  it("드롭다운 링크 클릭 시 메뉴가 닫힌다", () => {
    renderHeader();
    const toggle = screen.getByTestId("header-mobile-toggle");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(screen.getByTestId("header-mobile-link-demo"));
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("데스크톱 비로그인 nav 에도 /demo, /pricing 이 보인다 (R1 회귀 방지)", () => {
    renderHeader();
    // 데스크톱 nav 는 hidden sm:flex 라 jsdom 에서도 DOM 에 존재함
    // testid 가 없어도 href 로 접근 가능 — getAllByRole("link") 사용
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/demo");
    expect(hrefs).toContain("/pricing");
  });
});
