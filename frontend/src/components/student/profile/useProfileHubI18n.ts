"use client";

import { useCallback } from "react";
import { useI18n } from "@/contexts/I18nContext";
import profileKo from "../../../../messages/_patches/profileHub.ko.json";
import profileEn from "../../../../messages/_patches/profileHub.en.json";

/**
 * Profile + a11y 워크트리 전용 i18n 어댑터 (legacy `useDemoI18n` /
 * `useMarketingI18n` 패턴).
 *
 * 작업 제약상 `I18nContext.tsx` 무수정 → `_patches/profileHub.{ko,en}.json`
 * 두 파일을 직접 import 한 자체 dict 로 들고 다닌다. 본 패치 파일은
 * `profileHub` 와 `accessibilityHub` 두 namespace 를 함께 담고 있으며 어댑터는
 * 호출자 prefix 를 지정하지 않고 절대 경로 키를 그대로 받는다 (예:
 * `t("profileHub.streak.title")`, `t("accessibilityHub.panel.title")`).
 *
 * 머지 시점: `I18nContext.tsx` 의 patches 배열에 `profileHub` 두 파일을
 * 추가하면 본 어댑터를 무수정으로 thin wrapper 화 가능.
 */

type Messages = typeof profileKo;

const dicts: Record<"ko" | "en", Messages> = {
  ko: profileKo,
  en: profileEn,
};

function lookup(dict: unknown, parts: string[]): unknown {
  let value: unknown = dict;
  for (const part of parts) {
    if (value && typeof value === "object") {
      value = (value as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return value;
}

export function useProfileHubI18n() {
  const { locale } = useI18n();
  const dict = dicts[locale] ?? dicts.ko;

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const value = lookup(dict, key.split("."));
      if (typeof value !== "string") return key;
      if (!params) return value;
      return value.replace(/\{(\w+)\}/g, (_, k) =>
        String(params[k] ?? `{${k}}`),
      );
    },
    [dict],
  );

  /** 배열·객체 항목 (단축키 표 등) 을 그대로 가져오는 escape hatch. */
  const tValue = useCallback(
    <T,>(key: string): T | undefined => {
      const value = lookup(dict, key.split("."));
      return value === undefined ? undefined : (value as T);
    },
    [dict],
  );

  return { t, tValue, locale };
}
