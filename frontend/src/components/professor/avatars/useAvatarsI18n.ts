"use client";

import { useCallback } from "react";
import { useI18n } from "@/contexts/I18nContext";

/**
 * 아바타 갤러리 전용 i18n 어댑터 — `useLearnersI18n` 패턴.
 *
 * `I18nContext` 가 `_patches/avatars.{ko,en}.json` 을 deep-merge 하므로
 * 자체 dict 는 불필요. 자동 `"avatars."` prefix 만 적용하는 thin wrapper.
 */
export function useAvatarsI18n() {
  const { t: tBase, locale } = useI18n();
  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string =>
      tBase(`avatars.${key}`, params),
    [tBase],
  );
  return { t, locale };
}
