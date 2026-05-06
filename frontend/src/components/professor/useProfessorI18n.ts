"use client";

import { useCallback } from "react";
import { useI18n } from "@/contexts/I18nContext";
import professorKo from "../../../messages/_patches/professor.ko.json";
import professorEn from "../../../messages/_patches/professor.en.json";

/**
 * 교수자 온보딩 전용 i18n 훅.
 *
 * 메인 `messages/ko.json` / `messages/en.json` 을 직접 수정하지 않고
 * `messages/_patches/professor.{ko,en}.json` 의 키를 사용하기 위한 격리 레이어.
 *
 * 키는 `professorOnboarding.` 프리픽스가 자동으로 붙는다고 가정합니다 —
 * 호출자는 짧은 키만 넘깁니다. (예: `t("checklistTitle")`)
 *
 * R2W1 (i18n + Header) 워크트리가 `I18nContext.tsx` 의 deep-merge 목록에
 * `professor.{ko,en}.json` 까지 추가해주면 (한 줄 import + 한 번 mergePatch),
 * 이 훅을 제거하고 그냥 `useI18n().t("professorOnboarding.checklistTitle")` 로
 * 갈아끼울 수 있습니다. 자세한 머지 절차는 MERGE_NOTES.R2W3.md 참조.
 */

type ProfessorMessages = typeof professorKo;

const messages: Record<"ko" | "en", ProfessorMessages> = {
  ko: professorKo,
  en: professorEn,
};

export function useProfessorI18n() {
  const { locale } = useI18n();
  const dict = messages[locale] ?? messages.ko;

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const parts = key.split(".");
      let value: unknown = dict.professorOnboarding as unknown;
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
    },
    [dict],
  );

  return { t, locale };
}
