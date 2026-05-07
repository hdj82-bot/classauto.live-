"use client";

import { useCallback } from "react";
import { useI18n } from "@/contexts/I18nContext";

/**
 * 교수자 대시보드 홈 전용 i18n 어댑터 — `useDemoI18n` 패턴 (R1).
 *
 * 이전 (R4 통합 직전): 자체 patch import + lookup 의 격리 어댑터.
 * 현재 (R5 코드 정리): `I18nContext` 가 `_patches/dashboardHub.{ko,en}.json`
 * 도 deep-merge 하므로 자체 dict 불필요. 자동 `"dashboardHub."` prefix 만
 * 적용하는 thin wrapper 로 단순화.
 *
 * 호출자 코드는 변경 없음 — 짧은 키 (`t("stats.watchCompletion")`) 그대로
 * 사용 가능.
 */
export function useDashboardHubI18n() {
  const { t: tBase, locale } = useI18n();
  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string =>
      tBase(`dashboardHub.${key}`, params),
    [tBase],
  );
  return { t, locale };
}
