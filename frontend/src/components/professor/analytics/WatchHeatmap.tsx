"use client";

import { useMemo } from "react";
import { useAnalyticsI18n } from "./useAnalyticsI18n";
import EmptyState from "./EmptyState";
import { ANALYTICS_PALETTE, watchHeatColor } from "./svg";
import type { WatchHeatmapData } from "./types";

/**
 * 슬라이드별 재시청·이탈 구간 히트맵.
 *
 * 백엔드 협의안:
 *   GET /api/v1/dashboard/{lecture_id}/engagement 또는 별도 endpoint 가
 *   `slides: [{index, replays, drops, durationSec}]` 를 포함하면 본 컴포넌트가
 *   자동으로 활성화된다. 현재 ESM dashboard.py 에는 슬라이드 단위 집계 함수가
 *   없으므로 — 도착 전까지는 EmptyState (comingSoon) 로 분기한다. 협의안의
 *   raw shape 은 BACKEND_ASKS.ANALYTICS.md 참조.
 *
 * - 슬라이드 셀 = 재시청 횟수 → 골드 농도 (alpha) + 숫자 라벨.
 * - 이탈(드롭) 횟수가 많은 슬라이드는 셀 우상단에 빨간 점(아이콘) 으로 보강
 *   → 색약자 친화. ARIA 라벨에도 동일 정보.
 */
interface WatchHeatmapProps {
  /** 백엔드에서 슬라이드 raw 가 도착하면 채워지는 데이터. */
  data: WatchHeatmapData | null;
}

export default function WatchHeatmap({ data }: WatchHeatmapProps) {
  const { t } = useAnalyticsI18n();
  // R5 lint: ?? [] fallback 을 useMemo 로 안정화 (CostMeter 와 동일 패턴).
  const slides = useMemo(() => data?.slides ?? [], [data?.slides]);

  const maxReplays = useMemo(() => {
    return slides.reduce((m, s) => Math.max(m, s.replays ?? 0), 0);
  }, [slides]);

  if (slides.length === 0) {
    return (
      <EmptyState
        title={t("watch.comingSoon")}
        description={`${t("watch.comingSoonDesc")} ${t("watch.fallbackHint")}`}
        bordered
      />
    );
  }

  const cellW = 56;
  const cellH = 64;
  const gap = 6;
  const cols = Math.min(slides.length, 12);
  const rows = Math.ceil(slides.length / cols);
  const padding = 12;
  const width = padding * 2 + cols * cellW + (cols - 1) * gap;
  const height = padding * 2 + rows * cellH + (rows - 1) * gap;

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">{t("watch.intro")}</p>
      <div className="overflow-x-auto -mx-2 px-2">
        <svg
          role="img"
          aria-label={t("section.watch")}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="block"
        >
          {slides.map((s, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = padding + col * (cellW + gap);
            const y = padding + row * (cellH + gap);
            const intensity =
              maxReplays > 0 ? (s.replays ?? 0) / maxReplays : 0;
            const fill = watchHeatColor(intensity);
            return (
              <g key={s.index ?? i}>
                <rect
                  x={x}
                  y={y}
                  width={cellW}
                  height={cellH}
                  rx={8}
                  fill={fill}
                  stroke={ANALYTICS_PALETTE.border}
                />
                <text
                  x={x + 8}
                  y={y + 16}
                  fontSize={10}
                  fill={ANALYTICS_PALETTE.textMuted}
                >
                  {t("watch.slide", { n: (s.index ?? i) + 1 })}
                </text>
                <text
                  x={x + cellW / 2}
                  y={y + cellH / 2 + 6}
                  textAnchor="middle"
                  fontSize={16}
                  fontWeight={600}
                  fill={ANALYTICS_PALETTE.text}
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {s.replays ?? 0}
                </text>
                {(s.drops ?? 0) > 0 && (
                  <g aria-hidden="true">
                    <circle
                      cx={x + cellW - 9}
                      cy={y + 9}
                      r={5}
                      fill={ANALYTICS_PALETTE.warning}
                    />
                    <text
                      x={x + cellW - 9}
                      y={y + 12}
                      textAnchor="middle"
                      fontSize={8}
                      fontWeight={700}
                      fill="#ffffff"
                    >
                      !
                    </text>
                  </g>
                )}
                <desc>
                  {t("watch.ariaCell", {
                    n: (s.index ?? i) + 1,
                    replays: s.replays ?? 0,
                    drops: s.drops ?? 0,
                  })}
                </desc>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
