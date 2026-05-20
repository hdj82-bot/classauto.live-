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
// namespace (e.g. "studio", "inbox") and are merged at module load — the
// canonical files keep nothing under those namespaces, so deep-merge is a
// pure addition.
//
// Once a worktree's strings have landed and parallel editing of the canonical
// files is no longer a risk, the patch is folded into ko.json/en.json directly
// and dropped from here (single source of truth for key search). The W2 demo /
// landingHub / marketing and W4 student namespaces were integrated this way —
// they now live in ko.json/en.json bodies, not in _patches.
import professorKo from "../../messages/_patches/professor.ko.json";
import professorEn from "../../messages/_patches/professor.en.json";
// ── W1–W4 통합 (2026-05-07): 영상 제작 마법사 / Q&A 인박스 / 분석 / 학습자 ──
import studioKo from "../../messages/_patches/studio.ko.json";
import studioEn from "../../messages/_patches/studio.en.json";
import inboxKo from "../../messages/_patches/inbox.ko.json";
import inboxEn from "../../messages/_patches/inbox.en.json";
// 주의: analytics patch 는 namespace 가 `analyticsHub` (기존 ko.json `analytics.*`
// 와 충돌 회피). 통합 시 그대로 deep-merge 적용 — 충돌 0건.
import analyticsKo from "../../messages/_patches/analytics.ko.json";
import analyticsEn from "../../messages/_patches/analytics.en.json";
import learnersKo from "../../messages/_patches/learners.ko.json";
import learnersEn from "../../messages/_patches/learners.en.json";
// ── R4 통합 (2026-05-07): features 신규 / dashboard 통계 / pricing 신규 ──
// 모두 *Hub 접미사 namespace — 기존 ko.json 의 dashboard.* / (features /
// pricing 미존재) 와 의미 혼선·충돌 회피. R3 의 analyticsHub 와 같은 패턴.
// (landingHub 는 ko.json/en.json 본체로 통합 완료 — 위 주석 참조.)
import featuresHubKo from "../../messages/_patches/featuresHub.ko.json";
import featuresHubEn from "../../messages/_patches/featuresHub.en.json";
import dashboardHubKo from "../../messages/_patches/dashboardHub.ko.json";
import dashboardHubEn from "../../messages/_patches/dashboardHub.en.json";
import pricingHubKo from "../../messages/_patches/pricingHub.ko.json";
import pricingHubEn from "../../messages/_patches/pricingHub.en.json";
// ── R5 통합 (2026-05-07): 약관·방침 / 도움말·changelog / 학생 mypage·접근성 ──
// profileHub patch 는 단일 파일에 `profileHub` + `accessibilityHub` 두 top-level
// namespace 를 모두 담고 있다 (W4 결정 — A11y 가 profile 의 일부로 함께
// 마운트되므로 같은 patch 에 묶음). deep-merge 가 두 namespace 모두 풀어줌.
import legalHubKo from "../../messages/_patches/legalHub.ko.json";
import legalHubEn from "../../messages/_patches/legalHub.en.json";
import helpHubKo from "../../messages/_patches/helpHub.ko.json";
import helpHubEn from "../../messages/_patches/helpHub.en.json";
import changelogHubKo from "../../messages/_patches/changelogHub.ko.json";
import changelogHubEn from "../../messages/_patches/changelogHub.en.json";
import profileHubKo from "../../messages/_patches/profileHub.ko.json";
import profileHubEn from "../../messages/_patches/profileHub.en.json";
// ── 2026-05-20: 강의 보관함 / 카드 액션 (이어서 제작·삭제) / 폴더 관리 ──
// dashboard 카드의 "스크립트 편집" 제거 후 [이어서 제작][삭제] 두 버튼으로 단순화,
// `+N개 더 보기` 가 클릭 가능한 라이브러리 진입점으로 승격되면서 폴더 정리 기능이
// 함께 들어왔다. namespace 는 `lectureCard` / `library` — 본체 / 다른 patch 와
// 충돌 없음.
import libraryKo from "../../messages/_patches/library.ko.json";
import libraryEn from "../../messages/_patches/library.en.json";
// ── 2026-05-20: shell nav 정리 (Q&A 인박스 라벨 단축) ──
// `nav.inbox` 의 본체 값("Q&A 인박스" / "Inbox") 을 "Q&A" 로 override —
// 220px 사이드바에서 라벨이 잘리는 문제를 해결한다. mergePatch 의 scalar
// overwrite 를 의도적으로 활용 (단일 키, 단일 namespace 라 충돌 위험 없음).
// 새 강의 / 구독 nav 항목은 Sidebar.tsx 에서 제거되어 본체 키는 그대로 유지.
import shellCleanupKo from "../../messages/_patches/shellCleanup.ko.json";
import shellCleanupEn from "../../messages/_patches/shellCleanup.en.json";

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

// 패치는 누적 적용 — professor → studio → inbox → analyticsHub → learners
// → featuresHub → dashboardHub → pricingHub → legalHub → helpHub →
// changelogHub → profileHub (+ accessibilityHub) 순. 모두 서로 다른
// top-level namespace 라 충돌 없음. 추후 새 patch 는 배열에 추가.
// (student / demo / marketing / landingHub 는 ko.json/en.json 본체로 통합 완료.)
const koPatches: Messages[] = [
  professorKo as Messages,
  studioKo as Messages,
  inboxKo as Messages,
  analyticsKo as Messages,
  learnersKo as Messages,
  featuresHubKo as Messages,
  dashboardHubKo as Messages,
  pricingHubKo as Messages,
  legalHubKo as Messages,
  helpHubKo as Messages,
  changelogHubKo as Messages,
  profileHubKo as Messages,
  libraryKo as Messages,
  shellCleanupKo as Messages,
];
const enPatches: Messages[] = [
  professorEn as Messages,
  studioEn as Messages,
  inboxEn as Messages,
  analyticsEn as Messages,
  learnersEn as Messages,
  featuresHubEn as Messages,
  dashboardHubEn as Messages,
  pricingHubEn as Messages,
  legalHubEn as Messages,
  helpHubEn as Messages,
  changelogHubEn as Messages,
  profileHubEn as Messages,
  libraryEn as Messages,
  shellCleanupEn as Messages,
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

// Hydration gate. useSyncExternalStore requires the client's initial snapshot
// to equal the server snapshot ("ko"); otherwise React logs a recoverable
// hydration error (minified #418 in prod) and re-renders the tree client-side.
// The persisted preference in localStorage can be "en", so reflecting it on
// the very first client render would mismatch the SSR HTML. We therefore keep
// the snapshot pinned to the server value until the first client mount
// completes (see I18nProvider effect), then flip and notify subscribers so the
// stored locale is applied via a normal client update — not a hydration pass.
let didHydrate = false;

function getLocaleSnapshot(): Locale {
  if (!didHydrate) return "ko"; // match getServerLocaleSnapshot until mounted
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

  // Runs once, after hydration has committed. Opening the gate here guarantees
  // the hydration render used the server value ("ko"); notifying subscribers
  // now makes useSyncExternalStore re-read getLocaleSnapshot and apply the
  // persisted locale through an ordinary client re-render.
  useEffect(() => {
    if (!didHydrate) {
      didHydrate = true;
      localeListeners.forEach((cb) => cb());
    }
  }, []);

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
