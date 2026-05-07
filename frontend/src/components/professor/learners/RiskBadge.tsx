"use client";

import type { RiskLevel } from "./risk";
import { useLearnersI18n } from "./useLearnersI18n";

interface Props {
  level: RiskLevel;
  /** 작은 도트 + 라벨 형태로 노출. compact=true 면 라벨 생략. */
  compact?: boolean;
}

const palette: Record<RiskLevel, { dot: string; bg: string; text: string }> = {
  high:      { dot: "bg-red-500",     bg: "bg-red-50",     text: "text-red-700" },
  medium:    { dot: "bg-amber-500",   bg: "bg-amber-50",   text: "text-amber-700" },
  low:       { dot: "bg-emerald-500", bg: "bg-emerald-50", text: "text-emerald-700" },
  completed: { dot: "bg-indigo-500",  bg: "bg-indigo-50",  text: "text-indigo-700" },
};

/**
 * 위험 학생 뱃지 — 의미적 컬러(빨강·녹색)는 교수자 데이터 시각화에서만
 * 허용되는 정책 (CLAUDE.md "컬러", docs/planning/05-instructor-pages.md §1)
 * 에 부합한다.
 */
export default function RiskBadge({ level, compact = false }: Props) {
  const { t } = useLearnersI18n();
  const labelKey = `risk${level.charAt(0).toUpperCase()}${level.slice(1)}`;
  const tooltipKey = `riskTooltip${level.charAt(0).toUpperCase()}${level.slice(1)}`;
  const palette_ = palette[level];

  return (
    <span
      data-testid={`learner-risk-${level}`}
      data-risk-level={level}
      title={t(tooltipKey)}
      aria-label={t(labelKey)}
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${palette_.bg} ${palette_.text}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${palette_.dot}`}
        aria-hidden="true"
      />
      {!compact && t(labelKey)}
    </span>
  );
}
