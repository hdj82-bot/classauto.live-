"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { LOOK_ETA_MS } from "./photoAvatarTypes";

interface LookProgressRingProps {
  /**
   * 룩 행 생성 시각(ISO8601). 서버 기준 경과로 ETA 를 계산해 탭을 닫았다 다시 열어도
   * 진행률을 잇는다. 없으면 컴포넌트가 처음 마운트된 시각으로 폴백한다.
   */
  createdAt?: string | null;
  reducedMotion?: boolean;
  /** 링 지름(px). 타일=46, 상세 모달=120 등 표시 맥락에 맞춰 키운다. */
  size?: number;
  t: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * 룩 생성 중 진행률 — 원형 ring + 중앙 % 숫자 + 남은 시간 추정. 시간 기반 추정이며
 * 실제 완료는 폴링이 확정하므로 92% 까지만 차오른다(끝까지 차면 거짓 완료처럼 보임).
 * 타일(LookTile)과 상세 모달(LookDetailModal)이 동일 UI 를 공유하기 위해 분리했다.
 *
 * Date.now() 는 렌더가 아닌 effect 안에서만 호출한다(react-hooks/purity 준수).
 */
export default function LookProgressRing({
  createdAt,
  reducedMotion,
  size = 46,
  t,
}: LookProgressRingProps) {
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [fallbackStart, setFallbackStart] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      setFallbackStart((prev) => prev ?? now);
      setNowMs(now);
    };
    tick(); // 즉시 1회 — 마운트 직후 바로 링이 차게.
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const parsedCreated = createdAt ? Date.parse(createdAt) : NaN;
  const startMs = !Number.isNaN(parsedCreated) ? parsedCreated : fallbackStart;
  const elapsed =
    nowMs != null && startMs != null ? Math.max(0, nowMs - startMs) : 0;
  const progressPct = Math.min(0.92, elapsed / LOOK_ETA_MS);
  const pctNum = Math.round(progressPct * 100);
  const remainingSec = Math.max(0, Math.ceil((LOOK_ETA_MS - elapsed) / 1000));

  const stroke = Math.max(4, Math.round(size * 0.11));
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const percentFont = Math.round(size * 0.28);
  const labelFont = Math.max(10.5, Math.round(size * 0.13));

  return (
    <span
      style={wrap}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pctNum}
      aria-label={t("looks.tileGenerating")}
    >
      <span
        style={{
          position: "relative",
          width: size,
          height: size,
          display: "grid",
          placeItems: "center",
        }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--gold-soft, #FFE6A8)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--gold, #E89E0E)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - progressPct)}
            // 12시 방향에서 시작하도록 회전.
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{
              transition: reducedMotion ? "none" : "stroke-dashoffset 1s linear",
            }}
          />
        </svg>
        <span
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            fontSize: percentFont,
            fontWeight: 800,
            color: "var(--text)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {pctNum}%
        </span>
      </span>
      <span
        style={{
          marginTop: 6,
          fontSize: labelFont,
          fontWeight: 600,
          color: "var(--text-faint)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {remainingSec > 0
          ? t("looks.tileEta", { sec: remainingSec })
          : t("looks.tileFinishing")}
      </span>
    </span>
  );
}

const wrap: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
};
