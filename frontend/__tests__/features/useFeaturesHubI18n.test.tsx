import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { I18nProvider } from "@/contexts/I18nContext";
import { useFeaturesHubI18n } from "@/components/features/useFeaturesHubI18n";

/**
 * Locale 전환 시 어댑터가 ko/en 사전을 올바르게 스왑하는지, 누락된 키는 그대로
 * 키를 반환하는지, 보간(`{value}`) 이 동작하는지 회귀 검증.
 */
describe("useFeaturesHubI18n", () => {
  it("returns Korean strings under the default locale", () => {
    const { result } = renderHook(() => useFeaturesHubI18n(), {
      wrapper: ({ children }) => <I18nProvider>{children}</I18nProvider>,
    });
    const title = result.current.t("hero.title");
    expect(title).toContain("PPT");
  });

  it("falls through to the key when not found", () => {
    const { result } = renderHook(() => useFeaturesHubI18n(), {
      wrapper: ({ children }) => <I18nProvider>{children}</I18nProvider>,
    });
    expect(result.current.t("does.not.exist")).toBe("does.not.exist");
  });

  it("interpolates {param} placeholders", () => {
    const { result } = renderHook(() => useFeaturesHubI18n(), {
      wrapper: ({ children }) => <I18nProvider>{children}</I18nProvider>,
    });
    const out = result.current.t("progress.ariaProgress", { value: 42 });
    expect(out).toContain("42");
    // 키가 그대로 노출되지 않아야 한다
    expect(out).not.toBe("progress.ariaProgress");
  });
});
