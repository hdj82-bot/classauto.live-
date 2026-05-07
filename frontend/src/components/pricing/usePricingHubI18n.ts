"use client";

import { useCallback } from "react";
import { useI18n } from "@/contexts/I18nContext";
import pricingKo from "../../../messages/_patches/pricingHub.ko.json";
import pricingEn from "../../../messages/_patches/pricingHub.en.json";

/**
 * Pricing 워크트리 전용 i18n 어댑터 (legacy `useDemoI18n` / `useMarketingI18n`
 * 패턴).
 *
 * 작업 제약상 `I18nContext.tsx` 를 수정하지 않으므로, 본 워크트리는 패치 파일을
 * 직접 import 해 자체 dict 로 들고 다닙니다. 머지 시점에는 `I18nContext.tsx`
 * 의 patches 배열에 두 파일을 추가하고 본 어댑터를 thin wrapper 로 다운그레이드
 * 하는 정리가 권장됩니다 (MERGE_NOTES.PRICING.md §i18n 참조).
 *
 * 호출자 표기: `t("hero.title")` → 내부에서 `pricingHub.hero.title` 로 lookup.
 */
type Messages = typeof pricingKo;

const dicts: Record<"ko" | "en", Messages> = {
  ko: pricingKo,
  en: pricingEn,
};

export function usePricingHubI18n() {
  const { locale } = useI18n();
  const dict = dicts[locale] ?? dicts.ko;

  const resolve = useCallback(
    (key: string): unknown => {
      const parts = key.split(".");
      let value: unknown = dict.pricingHub as unknown;
      for (const part of parts) {
        if (value && typeof value === "object") {
          value = (value as Record<string, unknown>)[part];
        } else {
          return undefined;
        }
      }
      return value;
    },
    [dict],
  );

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const value = resolve(key);
      if (typeof value !== "string") return key;
      if (!params) return value;
      return value.replace(/\{(\w+)\}/g, (_, k) =>
        String(params[k] ?? `{${k}}`),
      );
    },
    [resolve],
  );

  /**
   * 배열·객체 형태 patch 키를 가져온다 (예: `faq.items`). 컴포넌트가 데이터를
   * 코드에 박지 않고 patch 파일에서 그대로 렌더할 수 있게 해주는 escape hatch.
   */
  const tValue = useCallback(
    <T,>(key: string): T | undefined => {
      const v = resolve(key);
      return v === undefined ? undefined : (v as T);
    },
    [resolve],
  );

  return { t, tValue, locale };
}
