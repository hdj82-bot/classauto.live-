"use client";

import { useCallback } from "react";
import { useI18n } from "@/contexts/I18nContext";
import dashboardHubKo from "../../../../messages/_patches/dashboardHub.ko.json";
import dashboardHubEn from "../../../../messages/_patches/dashboardHub.en.json";

/**
 * 교수자 대시보드 홈(`/professor/dashboard` 정상 분기) 전용 i18n 훅.
 *
 * `messages/_patches/dashboardHub.{ko,en}.json` 키를 본 워크트리(`feat/dashboard-stats`)
 * 단독으로 사용하기 위한 격리 어댑터 — `useMarketingI18n` / `useAnalyticsI18n` /
 * 구 `useDemoI18n` 과 동일 패턴이다. 본 훅은 `I18nContext` 의 deep-merge
 * 목록 변경 없이 패치 dict 를 직접 import 하므로 워크트리 통합 PR 사이의
 * 충돌 위험이 없다(MERGE_NOTES 참조).
 *
 * 호출자는 키 prefix(`dashboardHub.`) 를 생략한 짧은 키를 그대로 쓸 수 있다.
 *   ex) t("stats.watchCompletion")  →  dashboardHub.stats.watchCompletion
 *
 * locale 자체는 `useI18n` 이 관리하는 단일 source 를 그대로 따라간다.
 */

type DashboardHubMessages = typeof dashboardHubKo;

const dicts: Record<"ko" | "en", DashboardHubMessages> = {
  ko: dashboardHubKo,
  en: dashboardHubEn,
};

function lookup(dict: DashboardHubMessages, key: string): unknown {
  const parts = key.split(".");
  let value: unknown = (dict as { dashboardHub: unknown }).dashboardHub;
  for (const part of parts) {
    if (value && typeof value === "object") {
      value = (value as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return value;
}

export function useDashboardHubI18n() {
  const { locale } = useI18n();
  const dict = dicts[locale] ?? dicts.ko;

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const value = lookup(dict, key);
      if (typeof value !== "string") return key;
      if (!params) return value;
      return value.replace(/\{(\w+)\}/g, (_, k) =>
        String(params[k] ?? `{${k}}`),
      );
    },
    [dict],
  );

  return { t, locale };
}
