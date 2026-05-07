"use client";

import { useState, type ReactNode } from "react";
import Sparkline from "./Sparkline";
import { useCountUp } from "./useCountUp";
import { HUB_PALETTE, type StatKind, colorForStatKind } from "./palette";
import { useDashboardHubI18n } from "./useDashboardHubI18n";

/**
 * 통계 카드 — animations.md §4.1.
 *
 * - 진입 시 카운트업 (`useCountUp`) — `prefers-reduced-motion` 자동 회피.
 * - 호버 시 sparkline `active` (채워짐 + stroke 굵어짐).
 * - delta 표시는 ▲/▼/= 글리프 + 컬러 이중 부호화 (색약자 친화).
 * - "warn" prop 으로 임계 초과 시 빨강 + `!` 글리프 (의미적 컬러,
 *   colors.md §5 — 교수자 데이터 시각화 영역만 허용).
 */
interface StatCardProps {
  label: string;
  /** 표시할 값. delay 카운트업이 끝나면 정확히 이 값. */
  value: number;
  unit?: string;
  /** 소수점 자리수 (default 0). */
  decimals?: number;
  kind: StatKind;
  /** "주의 필요" 표시 활성화 — 임계 초과 시 빨강 + 펄스. */
  warn?: boolean;
  /** sparkline points (지난 7일). null/undefined 시 placeholder. */
  trend?: Array<number | null> | null;
  /** 변화량(%-point or count). null = 데이터 없음. */
  delta?: number | null;
  /** delta 가 % 단위면 "%p" suffix 자동 추가용 hint. */
  deltaUnit?: string;
  /** 진행 바 (이번 달 영상 7/20 형태) — value/limit. */
  progressLimit?: number | null;
  /** click 핸들러 (옵션) — 카드를 button 으로 처리. */
  onClick?: () => void;
  /** "+더보기" 같은 보조 액션. */
  footer?: ReactNode;
}

export default function StatCard({
  label,
  value,
  unit,
  decimals = 0,
  kind,
  warn = false,
  trend,
  delta,
  deltaUnit,
  progressLimit,
  onClick,
  footer,
}: StatCardProps) {
  const { t } = useDashboardHubI18n();
  const [hover, setHover] = useState(false);
  const { value: animated, ref } = useCountUp(value, { decimals });

  const numberColor = colorForStatKind(kind, warn);
  const progressPct =
    progressLimit && progressLimit > 0
      ? Math.min(100, Math.round((value / progressLimit) * 100))
      : null;

  const Wrapper = onClick ? "button" : "div";
  const wrapperRoleProps = onClick
    ? ({ type: "button" as const, onClick } as const)
    : {};

  return (
    <Wrapper
      {...wrapperRoleProps}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      aria-label={t("stats.ariaCard", {
        label,
        value: `${formatValue(value, decimals)}${unit ?? ""}`,
      })}
      className={[
        "group relative w-full rounded-2xl border bg-white p-5 text-left",
        "motion-safe:transition motion-safe:duration-150",
        "hover:-translate-y-0.5 hover:shadow-md",
        warn ? "border-red-200" : "border-gray-200",
        warn ? "motion-safe:animate-pulse-subtle" : "",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        {warn && (
          <span
            aria-hidden="true"
            className="inline-flex h-5 w-5 flex-none items-center justify-center rounded-full text-[11px] font-semibold"
            style={{
              background: "rgba(239, 68, 68, 0.10)",
              color: HUB_PALETTE.warning,
            }}
          >
            !
          </span>
        )}
      </div>

      <p
        ref={ref as React.RefObject<HTMLParagraphElement>}
        className="mt-1 font-semibold tabular-nums"
        style={{ color: numberColor, fontSize: "2rem", lineHeight: "2.25rem" }}
      >
        {formatValue(animated, decimals)}
        {unit && (
          <span className="ml-1 text-base font-medium text-gray-500">
            {unit}
          </span>
        )}
      </p>

      {/* progress 바 (이번 달 영상) */}
      {progressPct !== null && (
        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100"
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full motion-safe:transition-[width] motion-safe:duration-500"
            style={{
              width: `${progressPct}%`,
              background: warn ? HUB_PALETTE.warning : HUB_PALETTE.gold,
            }}
          />
        </div>
      )}

      {/* delta 캡션 */}
      {delta !== undefined && (
        <DeltaLabel delta={delta} unit={deltaUnit} />
      )}

      {/* sparkline + 캡션 */}
      <div className="mt-3 flex items-end justify-between gap-2">
        <p className="text-[11px] text-gray-400">
          {trend && trend.some((v) => v !== null && Number.isFinite(v))
            ? t("stats.trendCaption")
            : t("stats.trendUnavailable")}
        </p>
        <Sparkline
          points={trend ?? null}
          active={hover}
          color={numberColor}
          width={88}
          height={28}
        />
      </div>

      {footer && <div className="mt-3">{footer}</div>}
    </Wrapper>
  );
}

function DeltaLabel({
  delta,
  unit,
}: {
  delta: number | null | undefined;
  unit?: string;
}) {
  const { t } = useDashboardHubI18n();
  if (delta === null || delta === undefined) {
    return null;
  }
  if (delta === 0) {
    return (
      <p className="mt-2 text-[11px] tabular-nums text-gray-500">
        <span aria-hidden="true">＝</span> {t("stats.deltaFlat")}
      </p>
    );
  }
  const positive = delta > 0;
  const glyph = positive ? "▲" : "▼";
  const color = positive ? HUB_PALETTE.success : HUB_PALETTE.warning;
  const abs = Math.abs(delta);
  return (
    <p
      className="mt-2 text-[11px] tabular-nums"
      style={{ color }}
    >
      <span aria-hidden="true">{glyph}</span>{" "}
      {positive
        ? t("stats.deltaUp", { delta: `${formatValue(abs, 1)}${unit ?? ""}` })
        : t("stats.deltaDown", { delta: `${formatValue(abs, 1)}${unit ?? ""}` })}
    </p>
  );
}

function formatValue(v: number, decimals: number): string {
  if (!Number.isFinite(v)) return "0";
  if (decimals <= 0) return Math.floor(v).toLocaleString();
  return v.toFixed(decimals);
}
