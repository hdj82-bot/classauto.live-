"use client";

import { useCallback } from "react";
import { useI18n } from "@/contexts/I18nContext";

/**
 * Demo 페이지 전용 i18n 훅 — `useI18n` 의 thin adapter.
 *
 * R2W1 통합 이전: 자체 messages dict 를 들고 다니는 격리 레이어였음.
 * R2W1 이후:    `I18nContext` 가 `_patches/demo.{ko,en}.json` 도 deep-merge
 *               하므로 데이터는 통일됐고, 본 훅은 호출자 코드를 깨지 않기 위한
 *               얇은 어댑터(자동 `"demo."` prefix)로만 남는다.
 *
 * 호출자는 `t("hero.headline2")` 형태로 짧은 키를 그대로 쓸 수 있고,
 * 내부적으로 `"demo.hero.headline2"` 가 lookup 된다.
 *
 * **후속 PR 권장**: demo 컴포넌트 호출자들을 `useI18n()` + `t("demo.<key>")`
 * 직접 호출로 점진 마이그레이션한 뒤 본 어댑터를 제거.
 */
export function useDemoI18n() {
  const { t: tBase, locale } = useI18n();
  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string =>
      tBase(`demo.${key}`, params),
    [tBase],
  );
  return { t, locale };
}
