"use client";

import { useCallback, useMemo } from "react";
import { useI18n, type Locale } from "@/contexts/I18nContext";
import studioKo from "../../../../messages/_patches/studio.ko.json";
import studioEn from "../../../../messages/_patches/studio.en.json";

/**
 * Studio 마법사 전용 i18n 훅 — 자체 patch import + 자동 prefix 어댑터.
 *
 * **워크트리 격리 시점에 의도적으로 self-contained**:
 * `_patches/studio.{ko,en}.json` 을 본 훅이 직접 import 해서 lookup 한다.
 * `I18nContext` 의 patches 배열에 등록하지 않아도 동작하므로, main 의
 * `I18nContext.tsx` 와 `professor.{ko,en}.json` 을 건드리지 않고 병렬
 * 워크트리가 안전하게 진행할 수 있다.
 *
 * **통합 PR 시 변환**: R1 의 `useDemoI18n` 처럼 `I18nContext.tsx` 의
 * `koPatches`/`enPatches` 배열에 `studioKo`/`studioEn` 을 추가하고
 * 본 훅을 thin wrapper (`useI18n` + 자동 `"studio."` prefix) 로 단순화.
 *
 * 호출자는 `t("step1.title")` 형태로 짧은 키만 쓴다 — 자동으로
 * `"studio.step1.title"` 가 lookup 된다.
 */

// 위 import 가 빌드 타임에 JSON 으로 인라인되어 ko/en 양쪽 deep tree.
type Messages = Record<string, unknown>;
const STUDIO_DICT: Record<Locale, Messages> = {
  ko: (studioKo as Messages).studio as Messages,
  en: (studioEn as Messages).studio as Messages,
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

export function useStudioI18n() {
  const { locale } = useI18n();
  const dict = useMemo(() => STUDIO_DICT[locale] ?? STUDIO_DICT.ko, [locale]);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string =>
      lookup(dict, key, params),
    [dict],
  );

  return { t, locale };
}
