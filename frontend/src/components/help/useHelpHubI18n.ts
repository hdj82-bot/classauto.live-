"use client";

import { useCallback } from "react";
import { useI18n } from "@/contexts/I18nContext";
import helpHubKo from "../../../messages/_patches/helpHub.ko.json";
import helpHubEn from "../../../messages/_patches/helpHub.en.json";

/**
 * `/help` (도움말 센터) 전용 i18n 훅.
 *
 * `messages/_patches/helpHub.{ko,en}.json` 의 키를 본 워크트리(`feat/help-changelog`)
 * 단독으로 사용하기 위한 격리 어댑터 — `useMarketingI18n` / `useAnalyticsI18n` /
 * `useDashboardHubI18n` 와 동일 패턴이다. `I18nContext.tsx` 의 deep-merge 목록을
 * 변경하지 않으므로 다른 워크트리와 충돌이 없다(MERGE_NOTES 참조).
 *
 * 호출자는 키 prefix(`helpHub.`) 를 생략한 짧은 키를 그대로 쓸 수 있다.
 *   ex) t("hero.title")  →  helpHub.hero.title
 *
 * `tValue` 는 FAQ 배열 등 비-string 값을 가져올 때 사용 (string 외 타입 캐스팅).
 */

type HelpMessages = typeof helpHubKo;

const dicts: Record<"ko" | "en", HelpMessages> = {
  ko: helpHubKo,
  en: helpHubEn,
};

function lookup(dict: HelpMessages, key: string): unknown {
  const parts = key.split(".");
  let value: unknown = (dict as { helpHub: unknown }).helpHub;
  for (const part of parts) {
    if (value && typeof value === "object") {
      value = (value as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return value;
}

export function useHelpHubI18n() {
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

  const tValue = useCallback(
    <T,>(key: string): T | undefined => {
      const value = lookup(dict, key);
      return value as T | undefined;
    },
    [dict],
  );

  return { t, tValue, locale };
}
