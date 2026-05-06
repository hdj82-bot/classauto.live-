"use client";

import { useCallback } from "react";
import { useI18n } from "@/contexts/I18nContext";
import marketingKo from "../../../messages/_patches/marketing.ko.json";
import marketingEn from "../../../messages/_patches/marketing.en.json";

/**
 * Marketing 페이지 전용 i18n 훅.
 *
 * `messages/_patches/marketing.{ko,en}.json` 의 키를 R2W1 의 본 I18nContext 변경
 * 없이 곧바로 사용하기 위한 격리 레이어. (W3 demo 의 `useDemoI18n` 과 동일 패턴)
 *
 * 사용 시 키 prefix 는 자동으로 `marketing.` 가 붙어있다고 가정합니다.
 *   ex) t("useCases.hero.title")  →  marketing.useCases.hero.title
 *
 * R2W1 이 I18nContext 의 deep-merge 목록에 marketing patch 를 추가하면 이 훅을
 * 제거하고 기본 useI18n().t("marketing.…") 로 대체할 수 있습니다.
 */

type MarketingMessages = typeof marketingKo;

const messages: Record<"ko" | "en", MarketingMessages> = {
  ko: marketingKo,
  en: marketingEn,
};

export function useMarketingI18n() {
  const { locale } = useI18n();
  const dict = messages[locale] ?? messages.ko;

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const parts = key.split(".");
      // 패치 파일 최상위는 항상 "marketing" 한 단계.
      let value: unknown = dict.marketing as unknown;
      for (const part of parts) {
        if (value && typeof value === "object") {
          value = (value as Record<string, unknown>)[part];
        } else {
          return key;
        }
      }
      if (typeof value !== "string") return key;
      if (!params) return value;
      return value.replace(/\{(\w+)\}/g, (_, k) =>
        String(params[k] ?? `{${k}}`),
      );
    },
    [dict],
  );

  /**
   * Returns a non-string value (array / object) at the given key path so a
   * page can render lists from the patch dictionary without hard-coding
   * them in the component. Returns `undefined` if the path is missing or
   * not the expected shape.
   */
  const tValue = useCallback(
    <T,>(key: string): T | undefined => {
      const parts = key.split(".");
      let value: unknown = dict.marketing as unknown;
      for (const part of parts) {
        if (value && typeof value === "object") {
          value = (value as Record<string, unknown>)[part];
        } else {
          return undefined;
        }
      }
      return value as T;
    },
    [dict],
  );

  return { t, tValue, locale };
}
