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

export type Locale = "ko" | "en";

const messages: Record<Locale, typeof ko> = { ko, en };

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
