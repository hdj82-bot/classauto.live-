"use client";

interface Props {
  /** 0~100. 범위 밖 값은 clamp. */
  value: number;
  /** 우측 텍스트 라벨. 미지정 시 "{value}%". */
  label?: string;
  /** ARIA 라벨 — 시각적 라벨이 별도일 때 명시. */
  ariaLabel?: string;
  /** "high" | "medium" | "low" | "completed" — 색상 의미만 적용, 다른 곳은 무채색. */
  tone?: "neutral" | "high" | "medium" | "low" | "completed";
  className?: string;
}

const toneClass: Record<NonNullable<Props["tone"]>, string> = {
  neutral: "bg-gray-700",
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-emerald-500",
  completed: "bg-emerald-600",
};

/**
 * 진행률 바 — Notion/Linear 스타일 얇은 (1.5px) 라인.
 *
 * 교수자 화면 디자인 시스템(라이트 베이스 + 골드/의미 컬러)에 맞춰
 * 의미적 컬러는 "위험" 신호 (high/medium) 가 있을 때만 적용한다.
 */
export default function ProgressBar({
  value,
  label,
  ariaLabel,
  tone = "neutral",
  className = "",
}: Props) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const display = label ?? `${clamped.toFixed(0)}%`;
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={ariaLabel ?? `${clamped.toFixed(0)} percent`}
      >
        <div
          className={`h-full transition-[width] duration-500 ease-out motion-reduce:transition-none ${toneClass[tone]}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 tabular-nums w-10 text-right shrink-0">
        {display}
      </span>
    </div>
  );
}
