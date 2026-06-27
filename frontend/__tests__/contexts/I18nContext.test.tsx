import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { act, createElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
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

/**
 * I18nProvider 하이드레이션 안전성 가드 (React #418 회귀 방지).
 *
 * ── 검증으로 밝혀진 사실 (커밋 56b71a1 평가) ─────────────────────────
 * DEPLOYMENT_PROGRESS.md 의 가설: "`getServerLocaleSnapshot()`=ko 인데
 * 수정 전 `getLocaleSnapshot()` 이 첫 client 렌더에서 localStorage 의
 * 'en' 을 읽어 SSR(ko)≠첫 CSR(en) → React #418" — **재현으로 반증됨**.
 *
 * `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)` 는
 * 하이드레이션 첫 client 렌더에 **세 번째 인자(getServerSnapshot)** 를
 * 사용하도록 React 가 보장한다. 따라서 `getLocaleSnapshot` 이 'en' 을
 * 반환하더라도 하이드레이션 렌더 값은 server 값 'ko' 로 SSR 과 일치하며,
 * 이후 store consistency 검사가 '일반 client 업데이트'로 'en' 전환을
 * 처리한다 — recoverable 에러(#418) 없음. 모듈 게이트 `didHydrate`(56b71a1)
 * 를 제거해도 이 동작은 불변(아래 테스트 + 별도 재현 실험으로 확인).
 *
 * 결론: 56b71a1 은 이 경로의 #418 에 대해 **무해하지만 no-op** 이다.
 * 프로덕션 #418 의 실제 원인은 I18nContext 로케일 스냅샷이 아니며 별도
 * 조사가 필요하다. 따라서 이 테스트는 "수정 효과 검증"이 아니라,
 * I18nProvider 가 (게이트 유무와 무관하게) SSR/CSR 로케일 스냅샷 일치를
 * 유지함을 못박는 **하이드레이션 안전성 회귀 가드**다 — 향후 getServerSnapshot
 * 인자 제거·로케일 스냅샷 직접 노출 같은 변경이 #418 을 재유입시키면 실패한다.
 *
 * 게이트는 모듈 스코프 상태이므로 케이스마다 `vi.resetModules()` +
 * 동적 import 로 새 모듈 인스턴스(didHydrate=false)를 받아 격리한다.
 */
describe("I18nContext — 하이드레이션 SSR/CSR 로케일 스냅샷 안전성 가드", () => {
  beforeEach(() => {
    // M2: 로케일 저장이 localStorage → 쿠키로 전환됨. 케이스 간 쿠키를 비운다.
    document.cookie = "ifl-locale=; path=/; max-age=0";
    window.localStorage.clear();
    vi.resetModules();
  });

  async function loadFresh() {
    // 동적 import — resetModules 후라 모듈 게이트가 초기화된 새 인스턴스
    return import("@/contexts/I18nContext");
  }

  async function ssrThenHydrate(Mod: {
    I18nProvider: (p: { children: ReactNode }) => ReactNode;
    useI18n: () => { locale: string };
  }) {
    function LocaleProbe() {
      const { locale } = Mod.useI18n();
      return createElement("span", { id: "loc" }, locale);
    }
    const tree = createElement(
      Mod.I18nProvider as never,
      null,
      createElement(LocaleProbe),
    );

    // SSR: useSyncExternalStore 는 server snapshot 사용 → 항상 "ko"
    const html = renderToString(tree);

    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);

    const recoverableErrors: unknown[] = [];
    await act(async () => {
      hydrateRoot(container, tree, {
        onRecoverableError: (e) => recoverableErrors.push(e),
      });
    });

    const finalLocale = container.querySelector("#loc")?.textContent;
    document.body.removeChild(container);
    return { html, recoverableErrors, finalLocale };
  }

  it("쿠키='en' 이어도 SSR/첫 CSR 스냅샷이 모두 'ko' → 하이드레이션 mismatch 없음", async () => {
    document.cookie = "ifl-locale=en; path=/";
    const Mod = await loadFresh();

    const { html, recoverableErrors, finalLocale } = await ssrThenHydrate(Mod);

    // SSR 출력은 server snapshot("ko") — useSyncExternalStore 가 보장
    expect(html).toContain(">ko<");
    // 하이드레이션 첫 client 렌더도 server snapshot 사용 → recoverable 에러 0건
    expect(recoverableErrors).toHaveLength(0);
    // 하이드레이션 후 store consistency 검사가 저장된 'en' 으로 정상 전환
    expect(finalLocale).toBe("en");
  });

  it("쿠키 미설정 시 SSR/CSR 모두 'ko' 로 일치", async () => {
    const Mod = await loadFresh();

    const { html, recoverableErrors, finalLocale } = await ssrThenHydrate(Mod);

    expect(html).toContain(">ko<");
    expect(recoverableErrors).toHaveLength(0);
    expect(finalLocale).toBe("ko");
  });

  it("쿠키='ko' 면 전환 없이 'ko' 로 안정 (mismatch 없음)", async () => {
    document.cookie = "ifl-locale=ko; path=/";
    const Mod = await loadFresh();

    const { recoverableErrors, finalLocale } = await ssrThenHydrate(Mod);

    expect(recoverableErrors).toHaveLength(0);
    expect(finalLocale).toBe("ko");
  });
});
