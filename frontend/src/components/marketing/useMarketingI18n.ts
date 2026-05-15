"use client";

import { useCallback } from "react";
import { useI18n } from "@/contexts/I18nContext";
import ko from "../../../messages/ko.json";
import en from "../../../messages/en.json";

/**
 * Marketing 페이지 전용 i18n 훅.
 *
 * `marketing.*` 키는 후속 정리 PR 에서 `_patches/marketing.{ko,en}.json`
 * → `messages/{ko,en}.json` 본체로 통합 완료됐다. 본 훅은 그대로 본체의
 * `marketing` 서브트리를 읽되, 자동 `marketing.` prefix + `tValue`
 * (배열/객체 lookup) 호출자 API 는 깨지 않게 유지하는 어댑터로 남는다.
 *   ex) t("useCases.hero.title")  →  marketing.useCases.hero.title
 *
 * 후속: 호출자를 `useI18n().t("marketing.…")` 직접 호출로 점진 마이그레이션한
 * 뒤 본 어댑터 제거 (demo 의 `useDemoI18n` 과 동일 방향).
 */

// 본체(ko.json/en.json)의 `marketing` 서브트리만 떼어 들고 다닌다. 전체
// 메시지 타입을 그대로 쓰면 ko/en 구조가 구조적으로 갈려 TS2719 가 난다
// (예: 일부 `_note` 키 비대칭) — useLandingI18n 과 같은 loose 타입 사용.
type Messages = Record<string, unknown>;

const MARKETING_DICT: Record<"ko" | "en", Messages> = {
  ko: (ko as Messages).marketing as Messages,
  en: (en as Messages).marketing as Messages,
};

export function useMarketingI18n() {
  const { locale } = useI18n();
  const dict = MARKETING_DICT[locale] ?? MARKETING_DICT.ko;

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const parts = key.split(".");
      let value: unknown = dict;
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
      let value: unknown = dict;
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
