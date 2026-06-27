"use client";

import type { AttentionSummary } from "./types";
import { useAnalyticsI18n } from "./useAnalyticsI18n";
import EmptyState from "./EmptyState";

/**
 * D (docs/planning/11 §D) — 집중 분석 도넛 + 중앙 집중도 점수.
 *
 * 백엔드 `/engagement` 응답 summary.attention(점수 0~100 + 집중/보통/산만 분포)을
 * 그대로 시각화한다. 산식은 backend dashboard.py `_attention_score` 상수에 문서화돼
 * 베타 데이터로 보정 가능. 데이터가 없으면 EmptyState.
 */
const SEGMENTS = [
  { key: "focused", color: "#16a34a" },
  { key: "moderate", color: "#f59e0b" },
  { key: "distracted", color: "#dc2626" },
] as const;

export default function AttentionScore({ data }: { data: AttentionSummary | null }) {
  const { t } = useAnalyticsI18n();
  const dist = data?.distribution;
  const total = dist ? dist.focused + dist.moderate + dist.distracted : 0;

  if (!data || total === 0) {
    return <EmptyState title={t("attention.empty")} description={t("attention.emptyDesc")} />;
  }

  // 도넛 — 둘레를 분포 비율로 나눠 stroke-dasharray 로 그린다. 누적 오프셋은
  // 가변 변수 재할당(React 컴파일러 금지) 대신 '앞 세그먼트 합'으로 계산한다.
  const R = 52;
  const C = 2 * Math.PI * R;
  const counts = SEGMENTS.map((seg) => dist![seg.key]);
  const arcs = SEGMENTS.map((seg, i) => {
    const count = counts[i];
    const frac = count / total;
    const prevFrac = counts.slice(0, i).reduce((a, b) => a + b, 0) / total;
    return { ...seg, count, dash: frac * C, gap: C - frac * C, off: prevFrac * C };
  });

  const scoreColor =
    data.score >= 70 ? "#16a34a" : data.score >= 40 ? "#f59e0b" : "#dc2626";

  return (
    <div className="flex flex-col sm:flex-row items-center gap-8">
      <div className="relative shrink-0" style={{ width: 140, height: 140 }}>
        <svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label={t("attention.score")}>
          <circle cx="70" cy="70" r={R} fill="none" stroke="#f1f1ee" strokeWidth="14" />
          {arcs.map((a) =>
            a.count > 0 ? (
              <circle
                key={a.key}
                cx="70"
                cy="70"
                r={R}
                fill="none"
                stroke={a.color}
                strokeWidth="14"
                strokeDasharray={`${a.dash} ${a.gap}`}
                strokeDashoffset={-a.off}
                transform="rotate(-90 70 70)"
              />
            ) : null,
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold tabular-nums" style={{ color: scoreColor }}>
            {data.score}
          </span>
          <span className="text-[11px] text-gray-400">{t("attention.scoreUnit")}</span>
        </div>
      </div>

      <div className="flex-1 w-full">
        <p className="text-sm font-medium text-gray-700 mb-3">{t("attention.score")}</p>
        <ul className="space-y-2">
          {arcs.map((a) => (
            <li key={a.key} className="flex items-center gap-2 text-sm">
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: a.color }} />
              <span className="text-gray-600">{t(`attention.bucket.${a.key}`)}</span>
              <span className="ml-auto tabular-nums text-gray-800 font-medium">
                {t("attention.studentCount", { count: a.count })}
              </span>
              <span className="tabular-nums text-gray-400 w-12 text-right">
                {Math.round((a.count / total) * 100)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
