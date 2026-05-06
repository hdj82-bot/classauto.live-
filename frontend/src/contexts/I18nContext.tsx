"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import ko from "../../messages/ko.json";
import en from "../../messages/en.json";
// Patch files allow worktree-scoped string additions without editing the
// canonical ko.json/en.json (those are owned by main and other worktrees may
// be editing them in parallel). New keys live under their own top-level
// namespace (e.g. "student", "demo") and are merged at module load — the
// canonical files keep nothing under those namespaces, so deep-merge is a
// pure addition.
import studentKo from "../../messages/_patches/student.ko.json";
import studentEn from "../../messages/_patches/student.en.json";
import demoKo from "../../messages/_patches/demo.ko.json";
import demoEn from "../../messages/_patches/demo.en.json";
import professorKo from "../../messages/_patches/professor.ko.json";
import professorEn from "../../messages/_patches/professor.en.json";
import marketingKo from "../../messages/_patches/marketing.ko.json";
import marketingEn from "../../messages/_patches/marketing.en.json";

export type Locale = "ko" | "en";

type Messages = Record<string, unknown>;

// Recursive deep-merge — patches add new keys / new branches, never overwrite
// canonical keys from ko.json / en.json (would indicate a collision).
function mergePatch<T extends Messages>(base: T, patch: Messages): T {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const existing = out[key];
    if (
      existing &&
      typeof existing === "object" &&
      !Array.isArray(existing) &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      out[key] = mergePatch(existing as Messages, value as Messages);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

// 패치는 누적 적용 — student → demo → professor → marketing 순.
// 모두 서로 다른 top-level namespace 라 충돌 없음. 추후 새 patch 는 배열에 추가.
const koPatches: Messages[] = [
  studentKo as Messages,
  demoKo as Messages,
  professorKo as Messages,
  marketingKo as Messages,
];
const enPatches: Messages[] = [
  studentEn as Messages,
  demoEn as Messages,
  professorEn as Messages,
  marketingEn as Messages,
];

const koMerged = koPatches.reduce(
  (acc, p) => mergePatch(acc, p),
  ko as Messages,
);
const enMerged = enPatches.reduce(
  (acc, p) => mergePatch(acc, p),
  en as Messages,
);

const messages: Record<Locale, Messages> = { ko: koMerged, en: enMerged };

const LOCALE_STORAGE_KEY = "ifl-locale";

interface I18nContextType {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType>({
  locale: "ko",
  setLocale: () => {},
  t: (key) => key,
});

export function useI18n() {
  return useContext(I18nContext);
}

const localeListeners = new Set<() => void>();
function subscribeLocale(callback: () => void) {
  localeListeners.add(callback);
  return () => {
    localeListeners.delete(callback);
  };
}

function getLocaleSnapshot(): Locale {
  if (typeof window === "undefined") return "ko";
  const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  if (saved === "ko" || saved === "en") return saved;
  return "ko";
}

function getServerLocaleSnapshot(): Locale {
  return "ko";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(
    subscribeLocale,
    getLocaleSnapshot,
    getServerLocaleSnapshot,
  );

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, l);
    }
    localeListeners.forEach((cb) => cb());
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const parts = key.split(".");
      let value: unknown = messages[locale];
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
    [locale],
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}
