"use client";

import { useCallback } from "react";
import { useI18n } from "@/contexts/I18nContext";
import legalKo from "../../../messages/_patches/legalHub.ko.json";
import legalEn from "../../../messages/_patches/legalHub.en.json";

/**
 * /terms · /privacy 페이지 전용 i18n 어댑터 — `useDemoI18n` /
 * `useMarketingI18n` / `useFeaturesHubI18n` / `useInboxI18n` 와 동일 격리
 * 패턴.
 *
 * `messages/_patches/legalHub.{ko,en}.json` 의 키를 R2W1 의 I18nContext
 * 패치 목록 변경 없이 곧바로 사용하기 위한 격리 레이어. 본 워크트리는 작업
 * 제약상 I18nContext.tsx 를 수정하지 않습니다 (`MERGE_NOTES.LEGAL.md §2`).
 *
 * 키 prefix 는 자동으로 `legalHub.` 가 붙어있다고 가정합니다.
 *   ex) t("terms.hero.title")  →  legalHub.terms.hero.title
 */

type LegalMessages = typeof legalKo;

const messages: Record<"ko" | "en", LegalMessages> = {
  ko: legalKo,
  en: legalEn,
};

function lookup(dict: LegalMessages, key: string): unknown {
  const parts = key.split(".");
  let value: unknown = (dict as { legalHub: unknown }).legalHub;
  for (const part of parts) {
    if (value && typeof value === "object") {
      value = (value as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return value;
}

export function useLegalI18n() {
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

  /**
   * Looks up a non-string node (object / array) at the given key path. Used to
   * resolve structured `blocks`, `items`, `rows`, and `changeLog` arrays from
   * the patch dictionary without hard-coding them in TS.
   */
  const tValue = useCallback(
    <T,>(key: string): T | undefined => lookup(dict, key) as T | undefined,
    [dict],
  );

  return { t, tValue, locale };
}
