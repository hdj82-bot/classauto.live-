"use client";

import { useCallback, useMemo } from "react";
import { useI18n, type Locale } from "@/contexts/I18nContext";
import ko from "../../../messages/ko.json";
import en from "../../../messages/en.json";

/**
 * 랜딩 페이지 동적 요소 전용 i18n 훅 — `landingHub.*` 네임스페이스 prefix +
 * 숫자 lookup 어댑터.
 *
 * `landingHub.*` 키는 후속 정리 PR 에서 `_patches/landingHub.{ko,en}.json`
 * → `messages/{ko,en}.json` 본체로 통합 완료됐다. 본 훅은 그대로 본체에서
 * `landingHub` 서브트리를 읽되, 호출자 API(짧은 키 + `tNumber`)는 깨지
 * 않게 유지하는 어댑터로 남는다. 기존 `landing.*` 키는 호출자가
 * `useI18n()` 의 `t("landing.title1")` 로 직접 접근 (분리 유지).
 *
 * 호출자는 `t("stats.educatorsLabel")` 형태로 짧은 키만 쓴다 — 자동으로
 * `landingHub.stats.educatorsLabel` 가 lookup 된다. 카운트업 target 등
 * 숫자 값은 `tNumber` 로 읽는다 (`useI18n().t` 는 string 전용).
 */

type Messages = Record<string, unknown>;
const HUB_DICT: Record<Locale, Messages> = {
  ko: (ko as Messages).landingHub as Messages,
  en: (en as Messages).landingHub as Messages,
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
