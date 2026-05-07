"use client";

import { useId } from "react";
import { useCountUp } from "./useCountUp";
import { HUB_PALETTE } from "./palette";
import { useDashboardHubI18n } from "./useDashboardHubI18n";

/**
 * 비용 미터 — animations.md §4.6.
 *
 * - 그라데이션 진행 바: 0%(녹색) → 70%(골드) → 100%(빨강).
 * - `pct >= 80` 시 펄스 깜빡임(빨강) — 의미적 컬러는 교수자 영역에서만
 *   허용(colors.md §5).
 * - `prefers-reduced-motion` 사용자에게는 width transition + 펄스 모두 비활성:
 *   `motion-safe:` modifier 만 사용.
 * - 색약자 친화: 빨강 단독 금지 → `pct >= 80` 시 `!` 글리프 + 빨간 텍스트
 *   + 펄스 그림자 보조.
 */
interface CostMeterBarProps {
  usedUsd: number;
  /** 월 한도. null 이면 미설정 hint. */
  limitUsd: number | null;
  /** 압축형 — 카드 안에 작게 들어가는 변종. */
  compact?: boolean;
}

export default function CostMeterBar({
  usedUsd,
  limitUsd,
  compact = false,
}: CostMeterBarProps) {
  const { t } = useDashboardHubI18n();
  const idBase = useId().replace(/:/g, "-");
  // react-hooks/refs 룰: 객체 형태 (`used.ref`, `used.value`) 로 받으면
  // ref-like 객체로 추적되어 .value 접근까지 ref read 로 잡힌다. StatCard.tsx
  // 와 동일하게 destructure 로 분리해 lint 통과.
  const { value: amount, ref: meterRef } = useCountUp(usedUsd, { decimals: 2 });

  const pct =
    limitUsd && limitUsd > 0
      ? Math.min(100, (usedUsd / limitUsd) * 100)
      : 0;
  const warn80 = pct >= 80 && pct < 100;
  const warn100 = pct >= 100;
  const hasLimit = !!(limitUsd && limitUsd > 0);

  return (
    <div
      ref={meterRef as React.RefObject<HTMLDivElement>}
      className={`rounded-2xl border bg-white ${compact ? "px-4 py-3" : "px-5 py-4"} border-gray-200`}
      role="group"
      aria-label={t("costMeter.title")}
    >
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-gray-500">
            {t("costMeter.title")}
          </p>
          <p
            className="mt-0.5 font-semibold tabular-nums"
            style={{
              color: warn100 || warn80 ? HUB_PALETTE.warning : HUB_PALETTE.text,
              fontSize: compact ? "1.25rem" : "1.75rem",
              lineHeight: 1.1,
            }}
          >
            {hasLimit
              ? t("costMeter.amountOfLimit", {
                  used: amount.toFixed(2),
                  limit: (limitUsd as number).toFixed(2),
                })
              : t("costMeter.amountAlone", { used: amount.toFixed(2) })}
          </p>
        </div>
        {(warn80 || warn100) && (
          <span
            aria-hidden="true"
            className="inline-flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-bold motion-safe:animate-pulse"
            style={{
              background: "rgba(239, 68, 68, 0.14)",
              color: HUB_PALETTE.warning,
            }}
          >
            !
          </span>
        )}
      </div>

      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t("costMeter.ariaProgress", { pct: Math.round(pct) })}
      >
        <div
          id={`${idBase}-fill`}
          className="h-full motion-safe:transition-[width] motion-safe:duration-700"
          style={{
            width: `${hasLimit ? pct : 0}%`,
            background:
              "linear-gradient(90deg, #10B981 0%, #FFB627 70%, #EF4444 100%)",
            backgroundSize: "200% 100%",
            backgroundPosition: `${(100 - pct).toFixed(1)}% 0%`,
            boxShadow: warn80 || warn100
              ? "0 0 12px rgba(239, 68, 68, 0.55)"
              : undefined,
          }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px]">
        {!hasLimit && (
          <span className="text-gray-500">{t("costMeter.limitHint")}</span>
        )}
        {warn100 && (
          <span style={{ color: HUB_PALETTE.warning }}>
            {t("costMeter.warn100")}
          </span>
        )}
        {warn80 && !warn100 && (
          <span style={{ color: HUB_PALETTE.warning }}>
            {t("costMeter.warn80")}
          </span>
        )}
      </div>
    </div>
  );
}
