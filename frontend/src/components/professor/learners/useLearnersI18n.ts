"use client";

import { useCallback } from "react";
import { useI18n } from "@/contexts/I18nContext";
import learnersKo from "../../../../messages/_patches/learners.ko.json";
import learnersEn from "../../../../messages/_patches/learners.en.json";

/**
 * Learners 워크트리 전용 i18n 어댑터.
 *
 * 운영 규칙(`messages/_patches/README.md`)상 새 namespace patch 는 본래
 * `I18nContext.tsx` 의 import + `mergePatch` 한 줄을 늘려 통합해야 한다.
 * 다만 이 워크트리(feat/learners) 는 **`I18nContext.tsx` 를 수정하지 않는다**
 * 는 작업 제약(상단 사용자 지시) 을 받았다 — 다른 워크트리와의 충돌 차단이
 * 우선이기 때문. 따라서 `useDemoI18n` 가 R2W1 통합 이전 사용했던 legacy
 * 어댑터 패턴(자체 dict + locale 만 컨텍스트 공유) 으로 일시 보존하고,
 * 머지 시점에 `_patches/learners.{ko,en}.json` 을 `I18nContext.tsx` 에
 * 등록하면서 본 어댑터를 `useProfessorI18n` 처럼 thin wrapper 로
 * 다운그레이드하면 된다 (MERGE_NOTES.LEARNERS.md 참조).
 *
 * 호출자는 짧은 키 ("indexTitle") 를 그대로 사용 — 자동 `learners.` prefix.
 */
type Messages = Record<string, unknown>;

const dicts: Record<"ko" | "en", Messages> = {
  ko: learnersKo as Messages,
  en: learnersEn as Messages,
};

function lookup(
  dict: Messages,
  parts: string[],
  params?: Record<string, string | number>,
): string | null {
  let value: unknown = dict;
  for (const part of parts) {
    if (value && typeof value === "object") {
      value = (value as Record<string, unknown>)[part];
    } else {
      return null;
    }
  }
  if (typeof value !== "string") return null;
  if (!params) return value;
  return value.replace(/\{(\w+)\}/g, (_, k) =>
    String(params[k] ?? `{${k}}`),
  );
}

export function useLearnersI18n() {
  const { locale, t: tBase } = useI18n();
  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const fullKey = `learners.${key}`;
      const parts = fullKey.split(".");
      // 우선 본 어댑터 dict 에서 찾는다 (워크트리 격리). 미스 시 base 에 위임 —
      // 머지 후엔 base 에서 바로 잡혀 자연스럽게 patch 로 마이그레이션됨.
      const local = lookup(dicts[locale] ?? dicts.ko, parts, params);
      if (local !== null) return local;
      return tBase(fullKey, params);
    },
    [locale, tBase],
  );
  return { t, locale };
}
