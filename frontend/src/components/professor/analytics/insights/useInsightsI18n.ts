"use client";

import { useCallback } from "react";
import { useI18n } from "@/contexts/I18nContext";
import insightsKo from "../../../../../messages/_patches/insights.ko.json";
import insightsEn from "../../../../../messages/_patches/insights.en.json";

/**
 * 교수자 인사이트 보고서(`/professor/analytics/[id]/report`) 전용 i18n 훅.
 *
 * `useAnalyticsI18n` 과 동일한 격리 어댑터 패턴 — `messages/_patches/insights.*`
 * 를 본 훅에서만 import 한다. 통합 PR 에서 I18nContext deep-merge 목록에 한 줄
 * 추가되면 `useI18n().t("insightsHub.<key>")` 직접 호출로 마이그레이션 가능.
 *
 * 호출자는 `insightsHub.` prefix 를 생략한 짧은 키를 쓴다.
 *   ex) t("weakConcepts.title")  →  insightsHub.weakConcepts.title
 */
type InsightsMessages = typeof insightsKo;

const dicts: Record<"ko" | "en", InsightsMessages> = {
  ko: insightsKo,
  en: insightsEn,
};

function lookup(dict: InsightsMessages, key: string): unknown {
  const parts = key.split(".");
  let value: unknown = (dict as { insightsHub: unknown }).insightsHub;
  for (const part of parts) {
    if (value && typeof value === "object") {
      value = (value as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return value;
}

export function useInsightsI18n() {
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
