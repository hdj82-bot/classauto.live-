"use client";

import { useCallback } from "react";
import { useI18n } from "@/contexts/I18nContext";
import analyticsKo from "../../../../messages/_patches/analytics.ko.json";
import analyticsEn from "../../../../messages/_patches/analytics.en.json";

/**
 * 교수자 분석(`/professor/analytics`) 전용 i18n 훅.
 *
 * `messages/_patches/analytics.{ko,en}.json` 의 키를 본 워크트리(`feat/analytics`)
 * 단독으로 사용하기 위한 격리 어댑터 — `useMarketingI18n` / 과거의 `useDemoI18n`
 * 과 동일한 패턴이다. 패치 파일은 본 훅에서만 직접 import 하고, 통합 PR에서
 * `I18nContext` 의 deep-merge 목록에 한 줄 추가되면 본 어댑터를 제거하고 일반
 * `useI18n().t("analyticsHub.<key>")` 로 마이그레이션 가능하다 (MERGE_NOTES 참조).
 *
 * 호출자는 키 prefix (`analyticsHub.`) 를 생략한 짧은 키를 그대로 쓸 수 있다.
 *   ex) t("attendance.summaryLive")  →  analyticsHub.attendance.summaryLive
 *
 * locale 자체는 `useI18n` 이 관리하는 단일 source 를 그대로 따라간다.
 */

type AnalyticsMessages = typeof analyticsKo;

const dicts: Record<"ko" | "en", AnalyticsMessages> = {
  ko: analyticsKo,
  en: analyticsEn,
};

function lookup(
  dict: AnalyticsMessages,
  key: string,
): unknown {
  const parts = key.split(".");
  let value: unknown = (dict as { analyticsHub: unknown }).analyticsHub;
  for (const part of parts) {
    if (value && typeof value === "object") {
      value = (value as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return value;
}

export function useAnalyticsI18n() {
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

  /**
   * Returns array / object values (e.g. label arrays for histogram bins).
   * Components avoid hard-coding strings by reading them through this helper.
   */
  const tValue = useCallback(
    <T,>(key: string): T | undefined => {
      const value = lookup(dict, key);
      return value as T | undefined;
    },
    [dict],
  );

  return { t, tValue, locale };
}
