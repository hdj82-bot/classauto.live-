"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * 학습자 접근성 옵션 컨텍스트.
 *
 * 정책 (CLAUDE.md "절대 하지 말아야 할 것 — localStorage 사용 금지") 에 따라
 * **localStorage 는 사용하지 않는다**. 사용자의 작업 브리프가 명시적으로
 * 허용한 sessionStorage 만 사용 — 새 탭/창에서는 다시 기본값으로 시작한다.
 * 이는 영구 트래킹 가능성을 차단하기 위한 학생 데이터 보호 정책과 일관된다.
 *
 * 시스템 `prefers-reduced-motion` 이 켜져 있으면 사용자 토글과 OR 결합한다 —
 * 이를 통해 시스템 설정을 끈 채 앱에서만 모션을 줄일 수도 있고, 시스템에서
 * 줄여놓은 사용자가 추가 토글 없이도 영향을 받게 된다.
 */

export type FontSize = "normal" | "large" | "x-large";

interface State {
  captions: boolean;
  fontSize: FontSize;
  highContrast: boolean;
  reduceMotion: boolean;
}

interface ContextValue extends State {
  /** 시스템 `prefers-reduced-motion` 과 사용자 토글의 OR. UI 결정에 사용. */
  effectiveReduceMotion: boolean;
  setCaptions: (next: boolean) => void;
  setFontSize: (next: FontSize) => void;
  setHighContrast: (next: boolean) => void;
  setReduceMotion: (next: boolean) => void;
  reset: () => void;
}

const DEFAULT_STATE: State = {
  captions: false,
  fontSize: "normal",
  highContrast: false,
  reduceMotion: false,
};

const SESSION_KEY = "ifl-a11y";

const A11yContext = createContext<ContextValue | null>(null);

function readSession(): State {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<State>;
    return {
      captions: typeof parsed.captions === "boolean" ? parsed.captions : DEFAULT_STATE.captions,
      fontSize:
        parsed.fontSize === "large" || parsed.fontSize === "x-large"
          ? parsed.fontSize
          : DEFAULT_STATE.fontSize,
      highContrast:
        typeof parsed.highContrast === "boolean"
          ? parsed.highContrast
          : DEFAULT_STATE.highContrast,
      reduceMotion:
        typeof parsed.reduceMotion === "boolean"
          ? parsed.reduceMotion
          : DEFAULT_STATE.reduceMotion,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function writeSession(state: State) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
  } catch {
    // QuotaExceeded / disabled 등은 silent — 화면 토글은 동작 유지.
  }
}

interface ProviderProps {
  children: ReactNode;
  /** 테스트에서 결정론적으로 시작 상태를 주입. */
  initialState?: Partial<State>;
}

export function A11yProvider({ children, initialState }: ProviderProps) {
  // SSR safe: 서버에서는 DEFAULT_STATE, 클라이언트 마운트 후 sessionStorage 로 보강.
  const [state, setState] = useState<State>(() => ({
    ...DEFAULT_STATE,
    ...initialState,
  }));

  // 마운트 후 1회 sessionStorage 동기화 (initialState 가 명시되지 않은 경우만).
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (!hydrated && !initialState) {
      setState((prev) => ({ ...prev, ...readSession() }));
    }
    setHydrated(true);
  }, [hydrated, initialState]);

  // 상태 변화는 sessionStorage 에 즉시 반영. 단, 마운트 직후 동기화 1회는 제외
  // (그 호출은 sessionStorage 로부터 읽어왔으므로 다시 쓰는 건 무의미).
  useEffect(() => {
    if (!hydrated) return;
    writeSession(state);
  }, [hydrated, state]);

  // body 클래스 토글 + 자체 주입 <style> 로 a11y 효과를 가시화한다. globals.css
  // 를 수정하지 않고도 동작하도록 본 컴포넌트가 1회만 style 태그를 마운트한다 —
  // 다른 워크트리와의 globals.css 충돌을 사전에 차단.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const STYLE_ID = "ifl-a11y-style";
    if (!document.getElementById(STYLE_ID)) {
      const tag = document.createElement("style");
      tag.id = STYLE_ID;
      tag.textContent = `
        body.a11y-font-large { font-size: 18px; }
        body.a11y-font-x-large { font-size: 20px; }
        body.a11y-high-contrast { background: #000 !important; color: #fff !important; }
        body.a11y-high-contrast a { color: #ffd54f !important; }
        body.a11y-high-contrast .a11y-text { color: #fff !important; }
      `;
      document.head.appendChild(tag);
    }
    const root = document.body;
    root.classList.toggle("a11y-font-large", state.fontSize === "large");
    root.classList.toggle("a11y-font-x-large", state.fontSize === "x-large");
    root.classList.toggle("a11y-high-contrast", state.highContrast);
    return () => {
      // 언마운트 (라우팅 변경 등) 시 클래스 잔존하면 다른 페이지에도 영향 → 정리.
      root.classList.remove(
        "a11y-font-large",
        "a11y-font-x-large",
        "a11y-high-contrast",
      );
    };
  }, [state.fontSize, state.highContrast]);

  // 시스템 prefers-reduced-motion 구독 — 사용자 토글과 OR.
  const [systemReduce, setSystemReduce] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent | MediaQueryList) =>
      setSystemReduce("matches" in e ? e.matches : false);
    handler(mq);
    if ("addEventListener" in mq) {
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
    return undefined;
  }, []);

  const value = useMemo<ContextValue>(
    () => ({
      ...state,
      effectiveReduceMotion: state.reduceMotion || systemReduce,
      setCaptions: (next) => setState((s) => ({ ...s, captions: next })),
      setFontSize: (next) => setState((s) => ({ ...s, fontSize: next })),
      setHighContrast: (next) => setState((s) => ({ ...s, highContrast: next })),
      setReduceMotion: (next) => setState((s) => ({ ...s, reduceMotion: next })),
      reset: () => setState({ ...DEFAULT_STATE }),
    }),
    [state, systemReduce],
  );

  return <A11yContext.Provider value={value}>{children}</A11yContext.Provider>;
}

/**
 * `A11yProvider` 가 마운트되지 않은 트리에서 호출돼도 안전하게 기본 상태를
 * 반환한다. 이는 본 PR 이 lecture/[slug] 의 기존 본문을 무수정으로 두는 제약과
 * 양립하기 위함 — provider 없는 상황에서도 단축키·panel 가 동작하도록 한다.
 */
const fallback: ContextValue = {
  ...DEFAULT_STATE,
  effectiveReduceMotion: false,
  setCaptions: () => {},
  setFontSize: () => {},
  setHighContrast: () => {},
  setReduceMotion: () => {},
  reset: () => {},
};

export function useA11y(): ContextValue {
  return useContext(A11yContext) ?? fallback;
}
