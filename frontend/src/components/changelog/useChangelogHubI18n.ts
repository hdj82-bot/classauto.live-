"use client";

import { useCallback } from "react";
import { useI18n } from "@/contexts/I18nContext";
import changelogHubKo from "../../../messages/_patches/changelogHub.ko.json";
import changelogHubEn from "../../../messages/_patches/changelogHub.en.json";

/**
 * `/changelog` 전용 i18n 훅.
 *
 * 격리 어댑터 — `useHelpHubI18n` 과 동일 구조. `I18nContext.tsx` 의 정적 import
 * 목록은 다른 워크트리에서 변경되므로 본 PR 은 만지지 않는다(MERGE_NOTES 참조).
 *
 * 변경 로그 항목 자체는 i18n 패치가 아닌 `changelogEntries.ts` 의 정적 배열에서
 * 가져온다 — 항목 본문이 길고 PR 링크 / 카테고리 등 비-텍스트 필드를 포함하기
 * 때문에 키 트리에 평탄화하면 가독성이 나빠진다. 추후 백엔드 endpoint 가
 * 도착하면 fetch 로 교체.
 */

type ChangelogMessages = typeof changelogHubKo;

const dicts: Record<"ko" | "en", ChangelogMessages> = {
  ko: changelogHubKo,
  en: changelogHubEn,
};

function lookup(dict: ChangelogMessages, key: string): unknown {
  const parts = key.split(".");
  let value: unknown = (dict as { changelogHub: unknown }).changelogHub;
  for (const part of parts) {
    if (value && typeof value === "object") {
      value = (value as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return value;
}

export function useChangelogHubI18n() {
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
