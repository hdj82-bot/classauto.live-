"use client";

import type { CSSProperties } from "react";
import { tabularStyle } from "./tokens";

/**
 * 월 영상 편수 한도 미터 — 비용 미터(CostMeterBar) 대체.
 *
 * docs/planning/05-instructor-pages.md §1.1 (2026-05-06 갱신) 비용 표시 절대
 * 금지 정책에 따라 대시보드 우측 위젯의 "이번 달 사용 비용"을 편수 기반으로
 * 대체한다. Pro 플랜의 "월 20편" 같은 한도를 진행 바로 시각화.
 *
 * 디자인:
 * - shadow-sm 카드
 * - 헤더 라벨 + 사용/한도 큰 숫자 (tabular-nums)
 * - 그라데이션 진행 바 (gold soft → gold deep, 80% 이상 warn 펄스)
 */
export interface MonthlyQuotaMeterProps {
  /** 이번 달 사용 편수. */
  used: number;
  /** 한도 (Free=4, Basic=10, Pro=20). null 이면 unlimited 표시. */
  limit: number | null;
  /** 카드 헤더 라벨 (기본 "이번 달 영상 사용량"). */
  label?: string;
  /** 한도 단위 (기본 "편"). */
  unit?: string;
  /** 플랜 이름 표시 (선택). */
  planName?: string;
}

const cardStyle: CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--line)",
  borderRadius: 14,
  padding: 18,
  boxShadow: "var(--shadow-sm)",
};

const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-subtle)",
};

const valueRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  marginTop: 8,
};

const bigNumStyle: CSSProperties = {
  ...tabularStyle,
  fontSize: 28,
  fontWeight: 800,
  color: "var(--text)",
  letterSpacing: "-0.02em",
  lineHeight: 1,
};

const limitNumStyle: CSSProperties = {
  ...tabularStyle,
  fontSize: 13,
  fontWeight: 600,
  color: "var(--text-subtle)",
};

const meterTrackStyle: CSSProperties = {
  marginTop: 14,
  height: 8,
  borderRadius: 999,
  background: "var(--bg-subtle)",
  overflow: "hidden",
  border: "1px solid var(--line)",
};

const meterFillStyle = (pct: number, warn: boolean): CSSProperties => ({
  height: "100%",
  width: `${pct}%`,
  borderRadius: 999,
  background: warn
    ? "linear-gradient(90deg, #FFB627 0%, #EF4444 100%)"
    : "linear-gradient(90deg, #FFB627 0%, #E89E0E 100%)",
  transition: "width 800ms var(--ease-out)",
});

export default function MonthlyQuotaMeter({
  used,
  limit,
  label,
  unit = "편",
  planName,
}: MonthlyQuotaMeterProps) {
  const isUnlimited = limit === null;
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
  const warn = !isUnlimited && pct >= 80;

  return (
    <div style={cardStyle} role="region" aria-label={label ?? "이번 달 영상 사용량"}>
      <div className="flex items-center justify-between">
        <span style={labelStyle}>{label ?? "이번 달 영상 사용량"}</span>
        {planName && (
          <span
            className="inline-flex items-center rounded-full"
            style={{
              padding: "2px 8px",
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: "0.04em",
              color: "var(--gold)",
              background: "var(--gold-soft)",
            }}
          >
            {planName}
          </span>
        )}
      </div>

      <div style={valueRowStyle}>
        <span style={bigNumStyle}>{used.toLocaleString()}</span>
        <span style={limitNumStyle}>
          {isUnlimited ? "무제한" : `/ ${limit.toLocaleString()}${unit}`}
        </span>
      </div>

      {!isUnlimited && (
        <div style={meterTrackStyle} aria-hidden="true">
          <div style={meterFillStyle(pct, warn)} />
        </div>
      )}

      {warn && !isUnlimited && (
        <p
          className="mt-2"
          style={{ fontSize: 11.5, color: "var(--warning)", fontWeight: 500 }}
        >
          한도의 {pct}% 사용 — 다음 영상은 신중히
        </p>
      )}
    </div>
  );
}
