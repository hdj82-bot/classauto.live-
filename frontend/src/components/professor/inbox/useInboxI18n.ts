"use client";

import { useCallback } from "react";
import { useI18n } from "@/contexts/I18nContext";
import inboxKo from "../../../../messages/_patches/inbox.ko.json";
import inboxEn from "../../../../messages/_patches/inbox.en.json";

/**
 * Inbox 페이지 전용 i18n 훅 — `useMarketingI18n` / `useDemoI18n` 와 동일 패턴.
 *
 * `messages/_patches/inbox.{ko,en}.json` 의 키를 R2 통합 (I18nContext 의 patch
 * 목록에 inbox 추가) 이전에도 곧바로 사용하기 위한 격리 레이어. 본 훅은
 * I18nContext.tsx 를 건드리지 않고 인박스 워크트리만 단독으로 닫을 수 있게
 * 한다.
 *
 * - 사용 시 키 prefix 는 자동으로 `inbox.` 가 붙어있다고 가정합니다.
 *     ex) t("page.title")  →  inbox.page.title
 * - I18nContext 가 inbox patch 를 deep-merge 하면 본 훅 호출자를
 *   `useI18n() + t("inbox.<key>")` 직접 호출로 점진 마이그레이션 후 제거.
 */

type InboxMessages = typeof inboxKo;

const messages: Record<"ko" | "en", InboxMessages> = {
  ko: inboxKo,
  en: inboxEn,
};

function lookup(dict: InboxMessages, key: string): unknown {
  const parts = key.split(".");
  let value: unknown = (dict as { inbox: unknown }).inbox;
  for (const part of parts) {
    if (value && typeof value === "object") {
      value = (value as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return value;
}

export function useInboxI18n() {
  const { locale } = useI18n();
  const dict = messages[locale] ?? messages.ko;

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

  /**
   * Returns a non-string value (object/array) at the given key path. Useful
   * when the patch dictionary stores structured mock data.
   */
  const tValue = useCallback(
    <T,>(key: string): T | undefined => {
      const value = lookup(dict, key);
      return value as T | undefined;
    },
    [dict],
  );

  return { t, tValue, locale };
}
