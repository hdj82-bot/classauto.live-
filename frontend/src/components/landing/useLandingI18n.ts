"use client";

import { useCallback, useMemo } from "react";
import { useI18n, type Locale } from "@/contexts/I18nContext";
import landingKo from "../../../messages/_patches/landingHub.ko.json";
import landingEn from "../../../messages/_patches/landingHub.en.json";

/**
 * 랜딩 페이지 동적 요소 전용 i18n 훅 — 자체 patch import + prefix 어댑터.
 *
 * **격리 이유**: 본 PR 은 `I18nContext.tsx` 와 `messages/{ko,en}.json` 을
 * 무수정 상태로 두고 patch 만 추가한다 (병렬 워크트리 안전). main 의 기존
 * `landing.*` 네임스페이스는 그대로 유지하고, 동적 요소 관련 새 키만
 * `landingHub.*` 에 격리한다.
 *
 * **통합 PR 시 thin wrapper 다운그레이드**: R3 의 `useStudioI18n` 등과 동일
 * 패턴. `I18nContext` 의 patches 배열에 `landingHub` 등록 후 본 훅을
 * `useI18n` + 자동 prefix 어댑터로 단순화 가능.
 *
 * 호출자는 `t("stats.educatorsLabel")` 형태로 짧은 키만 쓴다 — 자동으로
 * `"landingHub.stats.educatorsLabel"` 가 lookup 된다. 기존 `landing.*` 키는
 * 호출자가 `useI18n()` 의 `t("landing.title1")` 로 직접 접근 (분리 유지).
 */

type Messages = Record<string, unknown>;
const HUB_DICT: Record<Locale, Messages> = {
  ko: (landingKo as Messages).landingHub as Messages,
  en: (landingEn as Messages).landingHub as Messages,
};

function lookup(
  dict: Messages,
  key: string,
  params?: Record<string, string | number>,
): string {
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
}

// 숫자 직접 lookup — stats 섹션의 카운트업 target 값 등 (string 이 아닌 number).
function lookupNumber(dict: Messages, key: string, fallback = 0): number {
  const parts = key.split(".");
  let value: unknown = dict;
  for (const part of parts) {
    if (value && typeof value === "object") {
      value = (value as Record<string, unknown>)[part];
    } else {
      return fallback;
    }
  }
  return typeof value === "number" ? value : fallback;
}

export function useLandingI18n() {
  const { locale } = useI18n();
  const dict = useMemo(() => HUB_DICT[locale] ?? HUB_DICT.ko, [locale]);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string =>
      lookup(dict, key, params),
    [dict],
  );

  const tNumber = useCallback(
    (key: string, fallback = 0): number => lookupNumber(dict, key, fallback),
    [dict],
  );

  return { t, tNumber, locale };
}
