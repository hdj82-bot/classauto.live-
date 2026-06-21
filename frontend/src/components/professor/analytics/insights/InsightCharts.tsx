"use client";

import { ANALYTICS_PALETTE, bucketAccuracy, colorForBucket } from "../svg";
import { useInsightsI18n } from "./useInsightsI18n";
import { withHan } from "./han";
import type { ReportEvidence, WeakConcept } from "./types";

/**
 * 인사이트 보고서 데이터 시각화 프리미티브 + 차트 (11 §H 시각화 보강).
 *
 * 차트 라이브러리 없이 SVG/CSS 로 직접 그린다(DEPS 도입 금지 정책). 모든 수치는
 * 백엔드 evidence 에서만 파생 — 임의 보간/예측값을 만들지 않는다. 색은 의미색
 * (정답률 히트 5단계)을 쓰되, 숫자 라벨을 항상 병기해 색약자도 값을 읽게 한다.
 */

const tabular: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

/** 도넛형 링 게이지 — 가운데에 % 텍스트. value/max(0~1) 만큼 호를 채운다. */
export function RingGauge({
  value,
  max = 100,
  color,
  size = 60,
  stroke = 7,
  suffix = "%",
}: {
  value: number;
  max?: number;
  color: string;
  size?: number;
  stroke?: number;
  suffix?: string;
}) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const cx = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${Math.round(value)}${suffix}`}>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--bg-subtle, #F1F1EC)" strokeWidth={stroke} />
      <circle
        cx={cx}
        cy={cx}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - ratio)}
        transform={`rotate(-90 ${cx} ${cx})`}
      />
      <text x={cx} y={cx} textAnchor="middle" dominantBaseline="central" style={tabular} fontSize={15} fontWeight={700} fill="var(--text, #0A0A0A)">
        {Math.round(value)}
        <tspan fontSize={9} fontWeight={600} dy={-5} fill="var(--text-subtle, #6B7280)">
          {suffix}
        </tspan>
      </text>
    </svg>
  );
}

/** 비율 막대 — value/total 만큼 채운 얇은 가로 바. */
export function ProportionBar({ value, total, color }: { value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <div style={{ height: 6, borderRadius: 999, background: "var(--bg-subtle)", overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 999 }} />
    </div>
  );
}

/** evidence 현황을 링·바로 시각화한 KPI 패널 (EvidenceStrip 의 시각화 버전). */
export function EvidenceVisuals({ evidence }: { evidence: ReportEvidence }) {
  const { t } = useInsightsI18n();
  const comp = evidence.completion;
  const quiz = evidence.quiz;
  const qa = evidence.qa;
  const att = evidence.attention;

  const accColor = colorForBucket(bucketAccuracy(quiz.overall_accuracy));

  const card: React.CSSProperties = {
    background: "var(--bg-subtle)",
    border: "1px solid var(--line)",
    borderRadius: 14,
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  };
  const labelStyle: React.CSSProperties = { margin: 0, fontSize: 11.5, fontWeight: 600, color: "var(--text-subtle)" };
  const subStyle: React.CSSProperties = { margin: 0, fontSize: 11, color: "var(--text-subtle)", ...tabular };
  const bigNum: React.CSSProperties = { margin: 0, fontSize: 26, fontWeight: 700, color: "var(--text)", lineHeight: 1, ...tabular };

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {/* 완주율 — 링 */}
      <div style={card}>
        <p style={labelStyle}>{t("evidence.completionRate")}</p>
        <div className="flex items-center gap-3">
          <RingGauge value={comp.completion_rate} color={ANALYTICS_PALETTE.success} />
          <p style={subStyle}>{t("evidence.completedOf", { completed: comp.completed, total: comp.total_students })}</p>
        </div>
      </div>

      {/* 평균 정답률 — 링(히트 색) */}
      <div style={card}>
        <p style={labelStyle}>{t("evidence.accuracy")}</p>
        <div className="flex items-center gap-3">
          <RingGauge value={quiz.overall_accuracy} color={accColor} />
          <p style={subStyle}>{t("evidence.totalQuestions", { count: quiz.total_questions })}</p>
        </div>
      </div>

      {/* 질문 수 — 큰 숫자 + 거부 비율 바 */}
      <div style={card}>
        <p style={labelStyle}>{t("evidence.qa")}</p>
        <p style={bigNum}>{qa.total}</p>
        <ProportionBar value={qa.rejections} total={qa.total} color={ANALYTICS_PALETTE.warning} />
        <p style={subStyle}>{t("evidence.rejected", { count: qa.rejections, rate: qa.rejection_rate })}</p>
      </div>

      {/* 딴짓 경고 — 큰 숫자 + 고경고 학습자 비율 바 */}
      <div style={card}>
        <p style={labelStyle}>{t("evidence.warnings")}</p>
        <p style={bigNum}>{att.total_warnings}</p>
        <ProportionBar value={att.high_warning_students} total={comp.total_students} color={ANALYTICS_PALETTE.warning} />
        <p style={subStyle}>{t("evidence.highWarning", { count: att.high_warning_students })}</p>
      </div>

      <p className="col-span-2 sm:col-span-4" style={{ margin: 0, fontSize: 11, color: "var(--text-subtle)" }}>
        {t("evidence.students", { count: comp.total_students })}
      </p>
    </div>
  );
}

/**
 * 취약 개념별 정답률 가로 막대 — 짧고 붉을수록 더 어려워한 개념.
 * 학급 평균(overall_accuracy)을 점선 기준선으로 겹쳐 상대 위치를 보여준다.
 * accuracy 근거가 있는 개념만 그리며, 없으면 렌더하지 않는다.
 */
export function WeakConceptAccuracyChart({
  concepts,
  classAvg,
}: {
  concepts: (WeakConcept & { kind?: string })[];
  classAvg: number;
}) {
  const { t } = useInsightsI18n();
  const rows = concepts
    .map((c) => {
      const acc = (c.evidence as Record<string, unknown> | undefined)?.accuracy;
      return typeof acc === "number" ? { concept: c.concept, accuracy: acc } : null;
    })
    .filter((r): r is { concept: string; accuracy: number } => r !== null)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 6);

  if (rows.length === 0) return null;
  const avgPct = Math.max(0, Math.min(100, classAvg));

  return (
    <div
      role="img"
      aria-label={`${t("weakConcepts.chartTitle")} — ${t("weakConcepts.classAvg", { value: classAvg })}`}
      style={{
        border: "1px solid var(--line)",
        borderRadius: 14,
        padding: 16,
        background: "var(--bg-card)",
        marginBottom: 16,
      }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>{t("weakConcepts.chartTitle")}</h3>
        <span style={{ fontSize: 11, color: "var(--text-subtle)", ...tabular }}>
          {t("weakConcepts.classAvg", { value: classAvg })}
        </span>
      </div>

      <div className="space-y-2.5">
        {rows.map((r) => {
          const color = colorForBucket(bucketAccuracy(r.accuracy));
          const w = Math.max(2, Math.min(100, r.accuracy));
          return (
            <div
              key={r.concept}
              style={{ display: "grid", gridTemplateColumns: "minmax(72px, 30%) 1fr auto", alignItems: "center", gap: 10 }}
            >
              <span
                title={r.concept}
                style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {withHan(r.concept)}
              </span>
              {/* 막대 트랙 + 채움 + 학급 평균 기준선 */}
              <div style={{ position: "relative", height: 16, borderRadius: 6, background: "var(--bg-subtle)", overflow: "hidden" }}>
                <div style={{ width: `${w}%`, height: "100%", background: color, borderRadius: 6 }} />
                <div
                  aria-hidden="true"
                  style={{ position: "absolute", top: -2, bottom: -2, left: `${avgPct}%`, width: 0, borderLeft: "2px dashed var(--text-subtle)" }}
                />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", minWidth: 34, textAlign: "right", ...tabular }}>
                {Math.round(r.accuracy)}%
              </span>
            </div>
          );
        })}
      </div>

      <p style={{ margin: "12px 0 0", fontSize: 11, color: "var(--text-subtle)" }}>{t("weakConcepts.chartHint")}</p>
    </div>
  );
}
