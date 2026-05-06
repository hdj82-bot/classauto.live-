"use client";

import { useCallback } from "react";
import { useI18n } from "@/contexts/I18nContext";
import demoKo from "../../../messages/_patches/demo.ko.json";
import demoEn from "../../../messages/_patches/demo.en.json";

/**
 * Demo 페이지 전용 i18n 훅.
 *
 * 메인 messages/ko.json / messages/en.json 을 직접 수정하지 않고
 * messages/_patches/demo.{ko,en}.json 의 키를 사용하기 위한 격리 레이어.
 *
 * 사용 시 키는 점(`.`) 표기법을 그대로 사용하되, 자동으로 `demo.` 프리픽스가
 * 붙어있다고 가정합니다. (예: `t("hero.headline2")` → `demo.hero.headline2`)
 *
 * 워크트리 머지 후 `_patches` 가 본체에 합쳐지면 이 훅을 제거하고
 * 메인 `useI18n().t("demo.hero.headline2")` 형태로 자동 치환할 수 있습니다.
 */

type DemoMessages = typeof demoKo;

const messages: Record<"ko" | "en", DemoMessages> = {
  ko: demoKo,
  en: demoEn,
};

export function useDemoI18n() {
  const { locale } = useI18n();
  const dict = messages[locale] ?? messages.ko;

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const parts = key.split(".");
      let value: unknown = dict.demo as unknown;
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
