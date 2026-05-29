"use client";

import { useCallback } from "react";
import { useI18n } from "@/contexts/I18nContext";

/**
 * 본인 아바타 온보딩 전용 i18n 어댑터 — `useAvatarsI18n` 패턴.
 *
 * `I18nContext` 가 `_patches/photoAvatarOnboarding.{ko,en}.json` 을
 * deep-merge 하므로 자체 dict 는 불필요. 자동 `"photoAvatarOnboarding."`
 * prefix 만 적용하는 thin wrapper.
 */
export function usePhotoAvatarI18n() {
  const { t: tBase, locale } = useI18n();
  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string =>
      tBase(`photoAvatarOnboarding.${key}`, params),
    [tBase],
  );
  return { t, locale };
}
