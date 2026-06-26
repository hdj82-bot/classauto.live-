import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import Header from "@/components/Header";
import { I18nProvider } from "@/contexts/I18nContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { tokens } from "@/lib/tokens";
import { vi } from "vitest";

// usePathname 이 null 을 반환하는 경우(초기/전환 시점)에도 isActive 가 터지지
// 않아야 한다 — optional chaining 가드 회귀 방지.
vi.mock("next/navigation", () => ({
  usePathname: () => null,
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
});

describe("Header — pathname null 가드", () => {
  it("pathname 이 null 이어도 크래시 없이 렌더된다", () => {
    expect(() => renderHeader()).not.toThrow();
    // 브랜드 홈 링크가 정상 렌더 — 컴포넌트가 끝까지 마운트됨
    expect(screen.getByLabelText("ClassAuto Home")).toBeTruthy();
  });
});
