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

/**
 * Studio 마법사 단계 인디케이터 — v2 라이트 + 골드 톤.
 *
 * 활성: gold-soft 배경 + gold 텍스트
 * 완료: success(녹색) 텍스트 + 체크 아이콘
 * 대기: text-faint, bg-subtle
 *
 * docs/design-system/colors.md §5 의 의미적 컬러 사용 매트릭스를 따른다 —
 * 녹색은 "긍정 변화 / 완료" 한정.
 */
export default function StepIndicator({
  current,
  reviewable = false,
  onJump,
}: StepIndicatorProps) {
  const { t } = useStudioI18n();

  return (
    <nav
      aria-label={t("stepIndicator.ariaProgress", { current, total: 5 })}
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--line)",
        borderRadius: 14,
        padding: "10px 14px",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <ol className="flex items-center gap-1 sm:gap-2 overflow-x-auto" style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {STEPS.map((step, idx) => {
          const stepKey = ["upload", "scriptReview", "avatarVoice", "render", "share"][idx];
          const isActive = step === current;
          const isDone = step < current;
          const clickable = reviewable && (isDone || isActive) && Boolean(onJump);

          const fg = isActive ? "var(--gold)" : isDone ? "var(--success)" : "var(--text-faint)";
          const bg = isActive ? "var(--gold-soft)" : "transparent";
          const ringColor = isActive ? "var(--gold-medium)" : "transparent";

          return (
            <li key={step} className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => clickable && onJump?.(step)}
                disabled={!clickable}
                aria-current={isActive ? "step" : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 12px",
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 600,
                  color: fg,
                  background: bg,
                  border: `1px solid ${ringColor}`,
                  cursor: clickable ? "pointer" : "default",
                  transition: "all 140ms var(--ease-out)",
                }}
              >
                <span
                  aria-hidden="true"
                  className="inline-flex items-center justify-center rounded-full"
                  style={{
                    width: 22,
                    height: 22,
                    fontSize: 11,
                    fontWeight: 800,
                    fontVariantNumeric: "tabular-nums",
                    color: isActive
                      ? "#0A0A0A"
                      : isDone
                        ? "#FFFFFF"
                        : "var(--text-faint)",
                    background: isActive
                      ? "linear-gradient(135deg, #FFB627, #E89E0E)"
                      : isDone
                        ? "linear-gradient(135deg, #10B981, #059669)"
                        : "var(--bg-subtle)",
                  }}
                >
                  {isDone ? (
                    <svg viewBox="0 0 16 16" width="11" height="11" fill="none">
                      <path
                        d="M3 8.5l3 3 7-7"
                        stroke="currentColor"
                        strokeWidth="2.4"
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
                  style={{
                    width: 28,
                    height: 1,
                    background: isDone ? "var(--success)" : "var(--line-strong)",
                    opacity: isDone ? 0.6 : 1,
                  }}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
