import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { I18nProvider, useI18n } from "@/contexts/I18nContext";

/**
 * `demo.*` / `student.*` 네임스페이스가 `t()` 로 lookup 되는지 검증.
 * 후속 정리 PR 에서 두 네임스페이스는 `_patches/*` → `messages/{ko,en}.json`
 * 본체로 통합됐다. 어댑터(`useDemoI18n`) 든 직접 `t("demo.<key>")` 든 동일한
 * lookup 을 받아야 한다 — 통합 전후 동작 회귀 방지.
 */
describe("I18nContext (demo/student namespace lookup)", () => {
  it("demo namespace 키를 t() 로 lookup 한다 (어댑터 없이 직접)", () => {
    const { result } = renderHook(() => useI18n(), { wrapper: I18nProvider });
    const v = result.current.t("demo.hero.headline2");
    // lookup 성공 시 키와 다른 문자열을 받아야 한다 (fallback 회피)
    expect(v).not.toBe("demo.hero.headline2");
    expect(typeof v).toBe("string");
    expect(v.length).toBeGreaterThan(0);
  });

  it("student namespace 키도 lookup 한다 (R1 통합 회귀 방지)", () => {
    const { result } = renderHook(() => useI18n(), { wrapper: I18nProvider });
    // student.entry.loginCta 는 student.ko.json 의 운영 카피
    const v = result.current.t("student.entry.loginCta");
    expect(v).not.toBe("student.entry.loginCta");
    expect(typeof v).toBe("string");
    expect(v.length).toBeGreaterThan(0);
  });

  it("기존 messages/ko.json 의 키는 그대로 동작 (Round 0 회귀 방지)", () => {
    const { result } = renderHook(() => useI18n(), { wrapper: I18nProvider });
    const v = result.current.t("common.loading");
    expect(v).not.toBe("common.loading");
    expect(typeof v).toBe("string");
    expect(v.length).toBeGreaterThan(0);
  });

  it("존재하지 않는 키는 키 자체를 fallback 으로 반환", () => {
    const { result } = renderHook(() => useI18n(), { wrapper: I18nProvider });
    expect(result.current.t("absolutely.nonexistent.key.path")).toBe(
      "absolutely.nonexistent.key.path",
    );
  });

  it("params 보간이 demo 패치에서도 동작한다", () => {
    const { result } = renderHook(() => useI18n(), { wrapper: I18nProvider });
    // demo.experience.questionsRemaining 는 {remaining}/{max} 보간 키
    const v = result.current.t("demo.experience.questionsRemaining", {
      remaining: 2,
      max: 3,
    });
    // 보간이 동작하면 "{remaining}" 토큰이 사라지고 "2" 가 들어감
    expect(v).not.toContain("{remaining}");
    expect(v).not.toContain("{max}");
    expect(v).toMatch(/2/);
    expect(v).toMatch(/3/);
  });
});
