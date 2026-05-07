"use client";

import { useCallback } from "react";
import { useI18n } from "@/contexts/I18nContext";
import featuresKo from "../../../messages/_patches/featuresHub.ko.json";
import featuresEn from "../../../messages/_patches/featuresHub.en.json";

/**
 * /features 페이지 전용 i18n 훅 — `useDemoI18n` / `useMarketingI18n` /
 * `useInboxI18n` 와 동일한 격리 어댑터 패턴.
 *
 * `messages/_patches/featuresHub.{ko,en}.json` 의 키를 R2W1 의
 * `I18nContext` 패치 목록 변경 없이 곧바로 사용하기 위한 레이어. 본 워크트리는
 * 작업 제약상 I18nContext.tsx 를 수정하지 않습니다 (`MERGE_NOTES.FEATURES.md
 * §2` 의 후속 작업 참조).
 *
 * 키 prefix 는 자동으로 `featuresHub.` 가 붙어있다고 가정합니다.
 *   ex) t("hero.title")  →  featuresHub.hero.title
 */

type FeaturesHubMessages = typeof featuresKo;

const messages: Record<"ko" | "en", FeaturesHubMessages> = {
  ko: featuresKo,
  en: featuresEn,
};

function lookup(dict: FeaturesHubMessages, key: string): unknown {
  const parts = key.split(".");
  let value: unknown = (dict as { featuresHub: unknown }).featuresHub;
  for (const part of parts) {
    if (value && typeof value === "object") {
      value = (value as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return value;
}

export function useFeaturesHubI18n() {
  const { locale } = useI18n();
  const dict = messages[locale] ?? messages.ko;

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

  /** Lookup non-string nodes (objects/arrays) for structured rendering. */
  const tValue = useCallback(
    <T,>(key: string): T | undefined => lookup(dict, key) as T | undefined,
    [dict],
  );

  return { t, tValue, locale };
}
