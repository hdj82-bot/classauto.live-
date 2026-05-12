"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import tokens from "./tokens-v2.module.css";
import styles from "./OnboardingFlowV2.module.css";

/**
 * OnboardingFlowV2 — 학생 첫 사용 4슬라이드 온보딩 (라이트→다크 전환).
 *
 * 출처: docs/prototypes/06-student-flow.extracted.html SCREEN 3
 *      + docs/planning/06-student-pages.md §5.
 *
 * - 슬라이드 1~3: 라이트, 슬라이드 4: 다크 (영상 시청 적응).
 * - 자동 진행 8/8/8/6초 (마지막 슬라이드는 멈춤 — 사용자가 CTA 클릭).
 * - prefers-reduced-motion 사용자에게는 모듈 CSS 가 transition 을 0.01ms 로
 *   단축 (animations.md §7 wildcard 규칙은 surface* 안에서 적용된다).
 * - localStorage 사용 금지(CLAUDE.md). 본 컴포넌트는 페이지가 mount 될 때마다
 *   `defaultVisible=true` 면 1회 표시되며, sessionStorage 의 `IFL_ONBOARDED_V2`
 *   플래그로 같은 탭 내 재표시를 막는다. 영구 storage 는 추후 backend
 *   `user.onboarded_at` 컬럼이 추가되면 그 값으로 교체.
 */
export interface OnboardingFlowV2Props {
  /** 마지막 슬라이드의 "영상 시작하기" 버튼 핸들러. 기본: 컴포넌트 hide. */
  onComplete?: () => void;
  /** 우측 상단 "건너뛰기" 핸들러. 기본: 컴포넌트 hide. */
  onSkip?: () => void;
  /** 한 탭당 첫 표시 후 sessionStorage 에 플래그를 저장할지 (기본 true). */
  rememberInSession?: boolean;
}

const SESSION_KEY = "IFL_ONBOARDED_V2";
const TIMINGS = [8000, 8000, 8000, 6000] as const;

export default function OnboardingFlowV2({
  onComplete,
  onSkip,
  rememberInSession = true,
}: OnboardingFlowV2Props) {
  const { t } = useI18n();
  const [idx, setIdx] = useState<1 | 2 | 3 | 4>(1);
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<number | null>(null);

  // sessionStorage 확인 — 같은 탭 내 두 번째 마운트면 즉시 hide.
  useEffect(() => {
    if (!rememberInSession) return;
    try {
      if (window.sessionStorage.getItem(SESSION_KEY) === "1") {
        setVisible(false);
      }
    } catch {
      /* private mode → 무시 (다시 보여도 OK) */
    }
  }, [rememberInSession]);

  // Auto-advance 1~3 → next.
  useEffect(() => {
    if (!visible) return;
    if (idx === 4) return;
    const ms = TIMINGS[idx - 1] ?? 8000;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setIdx((n) => (n < 4 ? ((n + 1) as 1 | 2 | 3 | 4) : n));
    }, ms);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [idx, visible]);

  const finish = () => {
    if (rememberInSession) {
      try {
        window.sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        /* ignore */
      }
    }
    setVisible(false);
  };

  const handleComplete = () => {
    finish();
    onComplete?.();
  };
  const handleSkip = () => {
    finish();
    onSkip?.();
  };

  const isDark = idx === 4;
  const rootCls = useMemo(
    () => `${tokens.surfaceLight} ${styles.root} ${isDark ? styles.dark : ""}`,
    [isDark],
  );

  if (!visible) return null;

  return (
    <div
      className={rootCls}
      role="dialog"
      aria-modal="true"
      aria-label={t("student.onboardingV2.slide1.head")}
      // 풀스크린 overlay — 영상 시청 페이지 위로 덮인다.
      style={{ position: "fixed", inset: 0, zIndex: 90, overflow: "hidden" }}
    >
      <div className={styles.top}>
        <div
          className={styles.dots}
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={4}
          aria-valuenow={idx}
        >
          {[1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={`${styles.dot} ${
                i < idx ? styles.dotDone : i === idx ? styles.dotCurrent : ""
              }`}
            />
          ))}
        </div>
        <button type="button" className={styles.skip} onClick={handleSkip}>
          {t("student.onboardingV2.skip")}
        </button>
      </div>

      <div className={styles.stage}>
        <Slide
          n={1}
          active={idx === 1}
          head={t("student.onboardingV2.slide1.head")}
          subLines={[
            t("student.onboardingV2.slide1.subLine1"),
            t("student.onboardingV2.slide1.subLine2"),
          ]}
          illust={<PlayIllust />}
        />
        <Slide
          n={2}
          active={idx === 2}
          head={t("student.onboardingV2.slide2.head")}
          subLines={[
            t("student.onboardingV2.slide2.subLine1"),
            t("student.onboardingV2.slide2.subLine2"),
          ]}
          illust={<ChatIllust />}
        />
        <Slide
          n={3}
          active={idx === 3}
          head={t("student.onboardingV2.slide3.head")}
          subLines={[
            t("student.onboardingV2.slide3.subLine1"),
            t("student.onboardingV2.slide3.subLine2"),
          ]}
          illust={<OwlIllust />}
        />
        <Slide
          n={4}
          active={idx === 4}
          head={t("student.onboardingV2.slide4.head")}
          subLines={[t("student.onboardingV2.slide4.sub")]}
          illust={<CheckIllust />}
          cta={
            <button type="button" className={styles.cta} onClick={handleComplete}>
              {t("student.onboardingV2.slide4.cta")}
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="13 6 19 12 13 18" />
              </svg>
            </button>
          }
        />
      </div>

      <div className={styles.bottom}>
        <button
          type="button"
          className={styles.arrow}
          aria-label={t("student.onboardingV2.previous")}
          disabled={idx === 1}
          onClick={() => setIdx((n) => (n > 1 ? ((n - 1) as 1 | 2 | 3 | 4) : n))}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span className={styles.count}>
          {t("student.onboardingV2.countFormat", { current: String(idx) })}
        </span>
        <button
          type="button"
          className={styles.arrow}
          aria-label={t("student.onboardingV2.next")}
          disabled={idx === 4}
          onClick={() => setIdx((n) => (n < 4 ? ((n + 1) as 1 | 2 | 3 | 4) : n))}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function Slide({
  n,
  active,
  head,
  subLines,
  illust,
  cta,
}: {
  n: 1 | 2 | 3 | 4;
  active: boolean;
  head: string;
  subLines: string[];
  illust: React.ReactNode;
  cta?: React.ReactNode;
}) {
  return (
    <div
      className={`${styles.slide} ${active ? styles.slideActive : ""}`}
      data-ob={n}
      aria-hidden={!active}
    >
      <div className={styles.illust} aria-hidden="true">
        <span className={styles.ring} />
        {illust}
      </div>
      <h2 className={styles.head}>{head}</h2>
      <p className={styles.sub}>
        {subLines.map((line, i) => (
          <span key={i}>
            {line}
            {i < subLines.length - 1 && <br />}
          </span>
        ))}
      </p>
      {cta}
    </div>
  );
}

/* ─────────── Illustrations (06 prototype 동일) ─────────── */

function PlayIllust() {
  return (
    <svg viewBox="0 0 220 220" fill="none">
      <circle cx="110" cy="110" r="82" fill="url(#ca-grad-electric)" opacity="0.15" />
      <circle
        cx="110"
        cy="110"
        r="66"
        fill="none"
        stroke="url(#ca-grad-electric)"
        strokeWidth={2.5}
        strokeDasharray="4 6"
      />
      <circle cx="110" cy="110" r="52" fill="url(#ca-grad-electric)" />
      <path d="M96 86l38 24-38 24V86z" fill="#0A0A0A" />
    </svg>
  );
}

function ChatIllust() {
  return (
    <svg viewBox="0 0 220 220" fill="none">
      <path
        d="M44 70a16 16 0 0 1 16-16h82a16 16 0 0 1 16 16v52a16 16 0 0 1-16 16H92l-24 20v-20H60a16 16 0 0 1-16-16V70z"
        fill="url(#ca-grad-violet)"
        opacity="0.85"
      />
      <path
        d="M112 86a16 16 0 0 1 16-16h32a16 16 0 0 1 16 16v40a16 16 0 0 1-16 16h-8l16 18-26-18h-14a16 16 0 0 1-16-16V86z"
        fill="url(#ca-grad-cyan)"
        opacity="0.85"
      />
      <circle cx="82" cy="96" r="4" fill="#FFFFFF" />
      <circle cx="100" cy="96" r="4" fill="#FFFFFF" />
      <circle cx="118" cy="96" r="4" fill="#FFFFFF" />
    </svg>
  );
}

function OwlIllust() {
  // 회갈색 단색 미니멀 올빼미 — mascot.md 의 채도 낮은 도형 기반.
  return (
    <svg viewBox="0 0 220 220" fill="none">
      <ellipse cx="110" cy="126" rx="58" ry="68" fill="#BFB39A" />
      <ellipse cx="110" cy="94" rx="56" ry="52" fill="#A99B7E" />
      <path d="M62 60c2-12 12-20 22-20s14 8 14 20l-4 12-32-12z" fill="#8C7E63" />
      <path d="M158 60c-2-12-12-20-22-20s-14 8-14 20l4 12 32-12z" fill="#8C7E63" />
      <circle cx="88" cy="96" r="14" fill="#FFFFFF" />
      <circle cx="132" cy="96" r="14" fill="#FFFFFF" />
      <circle cx="88" cy="102" r="6" fill="#0A0A0A" />
      <circle cx="132" cy="102" r="6" fill="#0A0A0A" />
      <path
        d="M104 124l6 6 6-6"
        stroke="#5C5141"
        strokeWidth={3}
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M96 144q14 -8 28 0"
        stroke="#5C5141"
        strokeWidth={2.6}
        strokeLinecap="round"
        fill="none"
      />
      <text x="170" y="58" fontFamily="sans-serif" fontSize="32" fontWeight={800} fill="#FFB627">
        ?
      </text>
    </svg>
  );
}

function CheckIllust() {
  return (
    <svg viewBox="0 0 220 220" fill="none">
      <circle cx="110" cy="110" r="82" fill="url(#ca-grad-success)" opacity="0.18" />
      <circle cx="110" cy="110" r="62" fill="url(#ca-grad-success)" />
      <path
        d="M82 110l22 22 38-44"
        stroke="#0A0A0A"
        strokeWidth={10}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
