"use client";

import { useCallback } from "react";
import { useI18n } from "@/contexts/I18nContext";

/**
 * 교수자 온보딩 전용 i18n 훅 — `useI18n` 의 thin adapter.
 *
 * R2 통합 이전 (R2W3 워크트리 단독 시점) 에는 자체 messages dict 를 들고 다니는
 * 격리 레이어였음. R2 통합 이후: `I18nContext` 가
 * `_patches/professor.{ko,en}.json` 도 deep-merge 하므로 데이터는 통일됐고,
 * 본 훅은 호출자 코드를 깨지 않기 위한 얇은 어댑터(자동 `"professorOnboarding."`
 * prefix)로만 남는다.
 *
 * 호출자는 `t("checklistTitle")` 형태로 짧은 키를 그대로 쓸 수 있고,
 * 내부적으로 `"professorOnboarding.checklistTitle"` 가 lookup 된다.
 *
 * 후속 PR 권장: 호출자들을 `useI18n()` + `t("professorOnboarding.<key>")`
 * 직접 호출로 점진 마이그레이션한 뒤 본 어댑터를 제거.
 */
export function useProfessorI18n() {
  const { t: tBase, locale } = useI18n();
  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string =>
      tBase(`professorOnboarding.${key}`, params),
    [tBase],
  );
  return { t, locale };
}
