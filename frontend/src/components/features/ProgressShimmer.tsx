"use client";

import { useEffect, useRef, useState } from "react";
import { useFeaturesHubI18n } from "./useFeaturesHubI18n";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";

/**
 * §3.3 Progress shimmer + 100% 도달 시 ✓ 그리기.
 *
 * 동작:
 *   - 컴포넌트가 화면에 들어오면 (`IntersectionObserver`) 0% → 100% 까지 자동
 *     증가. 약 6초에 걸쳐 6단계 학습 세션 (입장 → 시청 → 인터스티셜 → 평가 →
 *     요약 → 완료) 마커를 차례로 통과한다.
 *   - 100% 도달 시 옆에 ✓ 가 stroke-dasharray drawing 으로 그려짐
 *     (`featuresStyles.tsx` 의 `.fhub-check`).
 *   - "데모 다시 재생" 버튼으로 키보드/스크린리더 사용자도 다시 볼 수 있음.
 *   - prefers-reduced-motion 환경에서는 즉시 100% 정적 표시. matchMedia 를
 *     `useSyncExternalStore` 로 구독하므로 effect 안 sync-setState 가 없다.
 *
 * 접근성:
 *   - `<div role="progressbar" aria-valuemin/max/now/text>`.
 *   - 단계 라벨은 `<ol>` 로 노출 — 활성 단계에 `aria-current="step"`.
 */
const STEPS = [
  { key: "stepEnter", at: 0 },
  { key: "stepWatch", at: 20 },
  { key: "stepQuiz", at: 45 },
  { key: "stepAssess", at: 70 },
  { key: "stepSummary", at: 88 },
  { key: "stepDone", at: 100 },
] as const;

const TOTAL_DURATION_MS = 6000;
const FRAME_MS = 80;

export default function ProgressShimmer() {
  const { t } = useFeaturesHubI18n();
  // R5: inline 정의했던 subscribeReducedMotion / getReducedMotionSnapshot
  // helper 들을 frontend/src/lib/usePrefersReducedMotion.ts 의 공유 helper 로
  // 통합. 동작 1:1 동치 — 4 + 1 컴포넌트가 모두 같은 store 를 구독한다.
  const reduced = usePrefersReducedMotion();

  // 사용자 인터랙션 (replay) 으로 변하는 진행률은 별도 state. reduced 모드는
  // 렌더 단계에서 100 으로 override 하므로 여기에는 영향 없음.
  const [tickProgress, setTickProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const startRef = useRef<number>(0);
  const tickHandleRef = useRef<number | null>(null);

  // Auto-start on view via IntersectionObserver — single-shot. reduced 모드는
  // 진입 자체를 차단해 RAF/setTimeout 비용도 절약.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (reduced) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setRunning((prev) => (prev ? prev : true));
            obs.unobserve(node);
            break;
          }
        }
      },
      { threshold: 0.4 },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [reduced]);

  // Drive the progress as long as running.
  useEffect(() => {
    if (!running || reduced) return;
    startRef.current = performance.now();
    const tick = () => {
      const elapsed = performance.now() - startRef.current;
      const next = Math.min(100, (elapsed / TOTAL_DURATION_MS) * 100);
      setTickProgress(next);
      if (next < 100) {
        tickHandleRef.current = window.setTimeout(tick, FRAME_MS);
      } else {
        setRunning(false);
      }
    };
    tickHandleRef.current = window.setTimeout(tick, FRAME_MS);
    return () => {
      if (tickHandleRef.current !== null) {
        clearTimeout(tickHandleRef.current);
        tickHandleRef.current = null;
      }
    };
  }, [running, reduced]);

  const handleReplay = () => {
    if (tickHandleRef.current !== null) {
      clearTimeout(tickHandleRef.current);
      tickHandleRef.current = null;
    }
    if (reduced) return; // 정적 100% 유지
    setTickProgress(0);
    setRunning(true);
  };

  // reduced 면 즉시 완료 상태로 표시. 이렇게 렌더 단계에서 derive 하면
  // sync-setState-in-effect 없이도 외부 환경 변화에 깔끔히 반응 가능.
  const progress = reduced ? 100 : tickProgress;
  const rounded = Math.round(progress);
  const activeIndex = STEPS.reduce(
    (acc, step, i) => (rounded >= step.at ? i : acc),
    0,
  );
  const isComplete = rounded >= 100;

  return (
    <div
      ref={ref}
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6"
      data-testid="features-progress-card"
      data-progress={rounded}
      data-complete={isComplete}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-[11px] uppercase tracking-[0.18em] text-white/45 font-semibold">
          {t("progress.demoTitle")}
        </p>
        <button
          type="button"
          onClick={handleReplay}
          data-testid="features-progress-replay"
          className="text-[11px] font-medium rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white px-2.5 py-1 transition motion-reduce:transition-none"
        >
          {t("progress.controlPlay")}
        </button>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={rounded}
        aria-valuetext={t("progress.ariaProgress", { value: rounded })}
        className="relative h-2.5 w-full rounded-full bg-white/10 overflow-hidden"
      >
        <div
          className="fhub-shimmer h-full rounded-full transition-[width] duration-150 ease-out motion-reduce:transition-none"
          style={{ width: `${rounded}%` }}
          data-testid="features-progress-fill"
        />
      </div>

      {/* Step markers */}
      <ol className="mt-4 grid grid-cols-6 gap-1 text-[10px] sm:text-[11px] uppercase tracking-[0.12em] font-medium">
        {STEPS.map((step, i) => {
          const passed = rounded >= step.at;
          const active = i === activeIndex && !isComplete;
          return (
            <li
              key={step.key}
              data-testid={`features-progress-step-${step.key}`}
              data-state={passed ? (active ? "active" : "done") : "pending"}
              aria-current={active ? "step" : undefined}
              className={[
                "flex flex-col items-center gap-1.5",
                passed ? "text-amber-300" : "text-white/30",
              ].join(" ")}
            >
              <span
                className={[
                  "w-2 h-2 rounded-full",
                  passed ? "bg-amber-400" : "bg-white/15",
                ].join(" ")}
                aria-hidden="true"
              />
              <span className="leading-none">{t(`progress.${step.key}`)}</span>
            </li>
          );
        })}
      </ol>

      {/* 100% check */}
      <div
        className="mt-5 flex items-center gap-3"
        aria-live="polite"
        aria-atomic="true"
      >
        {isComplete ? (
          <>
            <svg
              viewBox="0 0 24 24"
              width="24"
              height="24"
              aria-hidden="true"
              focusable="false"
              data-testid="features-progress-check"
            >
              <circle
                cx="12"
                cy="12"
                r="11"
                fill="none"
                stroke="rgba(16,185,129,0.55)"
                strokeWidth="1.5"
              />
              <path
                key={progress}
                className="fhub-check"
                d="M6.5 12.5 L10.5 16 L17 8.5"
                fill="none"
                stroke="#34D399"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-sm font-semibold text-emerald-300">
              {t("progress.completeBadge")}
            </span>
          </>
        ) : (
          <span className="text-xs text-white/55 tabular-nums">
            {rounded}% / 100%
          </span>
        )}
      </div>
    </div>
  );
}
