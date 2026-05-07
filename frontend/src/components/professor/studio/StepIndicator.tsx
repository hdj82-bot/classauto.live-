"use client";

import type { StudioStep } from "./studioTypes";
import { useStudioI18n } from "./useStudioI18n";

interface StepIndicatorProps {
  current: StudioStep;
  // 호버해도 다른 단계로 점프 가능한지 — 기본 false (마법사이므로 순서 강제).
  // Step5 도달 후엔 모든 단계가 클릭 가능.
  reviewable?: boolean;
  onJump?: (step: StudioStep) => void;
}

const STEPS: StudioStep[] = [1, 2, 3, 4, 5];

export default function StepIndicator({
  current,
  reviewable = false,
  onJump,
}: StepIndicatorProps) {
  const { t } = useStudioI18n();

  return (
    <nav
      aria-label={t("stepIndicator.ariaProgress", { current, total: 5 })}
      className="bg-white border border-gray-200 rounded-2xl px-4 py-3"
    >
      <ol className="flex items-center gap-1 sm:gap-2 overflow-x-auto">
        {STEPS.map((step, idx) => {
          const stepKey = ["upload", "scriptReview", "avatarVoice", "render", "share"][idx];
          const isActive = step === current;
          const isDone = step < current;
          const clickable = reviewable && (isDone || isActive) && Boolean(onJump);

          return (
            <li key={step} className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => clickable && onJump?.(step)}
                disabled={!clickable}
                aria-current={isActive ? "step" : undefined}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition ${
                  isActive
                    ? "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200"
                    : isDone
                      ? "text-emerald-700"
                      : "text-gray-400"
                } ${clickable ? "hover:bg-gray-50 cursor-pointer" : "cursor-default"}`}
              >
                <span
                  className={`flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-semibold tabular-nums ${
                    isActive
                      ? "bg-indigo-600 text-white"
                      : isDone
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-gray-100 text-gray-400"
                  }`}
                  aria-hidden="true"
                >
                  {isDone ? (
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none">
                      <path
                        d="M3 8.5l3 3 7-7"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    step
                  )}
                </span>
                <span className="whitespace-nowrap">
                  {t(`stepNames.${stepKey}`)}
                </span>
              </button>
              {idx < STEPS.length - 1 && (
                <span
                  aria-hidden="true"
                  className={`w-6 sm:w-12 h-px ${isDone ? "bg-emerald-300" : "bg-gray-200"}`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
