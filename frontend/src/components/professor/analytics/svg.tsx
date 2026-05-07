/**
 * 분석 차트 공용 SVG 헬퍼.
 *
 * - 차트 라이브러리 없이 SVG 를 직접 그린다 (DEPS 도입 금지 정책).
 * - 의미적 컬러는 색상 + 패턴(사선·도트·체크) 이중 부호화로 색약자 친화.
 *   colors.md §9.3 "색맹 친화" 규칙을 차트 레벨에서 강제한다.
 * - id 충돌 회피: 각 차트가 고유한 prefix 를 받아서 sub-id 를 만든다.
 */

export const ANALYTICS_PALETTE = {
  // 라이트 베이스 위에서 4.5:1 이상 대비를 가지는 톤만 사용.
  bgCard: "#FFFFFF",
  border: "rgba(10, 10, 10, 0.10)",
  axis: "rgba(10, 10, 10, 0.40)",
  text: "#0A0A0A",
  textMuted: "rgba(10, 10, 10, 0.62)",
  // 시그니처 골드 (라이트 배경에서는 deep 톤)
  gold: "#B88308",
  goldSoft: "rgba(255, 182, 39, 0.15)",
  // 의미적 컬러 — colors.md §5
  warning: "#EF4444",
  success: "#10B981",
  info: "#3B82F6",
  neutral: "#6B7280",
  // 정답률 히트맵 5단계 (낮음 → 높음). 빨강 단독 X — 패턴이 함께 붙는다.
  heatLow: "#FCA5A5",
  heatMidLow: "#FCD34D",
  heatMid: "#FDE68A",
  heatHigh: "#86EFAC",
  heatVeryHigh: "#10B981",
} as const;

export type HeatBucket = "low" | "midLow" | "mid" | "high" | "veryHigh";

export function bucketAccuracy(accuracy: number): HeatBucket {
  if (accuracy < 40) return "low";
  if (accuracy < 60) return "midLow";
  if (accuracy < 75) return "mid";
  if (accuracy < 90) return "high";
  return "veryHigh";
}

export function colorForBucket(b: HeatBucket): string {
  return {
    low: ANALYTICS_PALETTE.heatLow,
    midLow: ANALYTICS_PALETTE.heatMidLow,
    mid: ANALYTICS_PALETTE.heatMid,
    high: ANALYTICS_PALETTE.heatHigh,
    veryHigh: ANALYTICS_PALETTE.heatVeryHigh,
  }[b];
}

/**
 * 색약자 친화 패턴 — 색상 외에 채움 패턴으로도 값 차이를 구분.
 * 낮음=cross / 중간=dot / 높음=diagonal. 5 단계 모두 패턴이 붙어있다.
 */
export function patternIdForBucket(prefix: string, b: HeatBucket): string {
  return `${prefix}-pat-${b}`;
}

interface PatternDefsProps {
  prefix: string;
}

/**
 * `<defs>` 묶음 — 차트 SVG 안에 한 번만 삽입한다. 다른 차트와 id 가
 * 겹치지 않도록 `prefix` 를 받는다.
 */
export function HeatPatternDefs({ prefix }: PatternDefsProps) {
  return (
    <defs>
      {/* low — 빨강 + cross hatch */}
      <pattern
        id={patternIdForBucket(prefix, "low")}
        width="6"
        height="6"
        patternUnits="userSpaceOnUse"
      >
        <rect width="6" height="6" fill={ANALYTICS_PALETTE.heatLow} />
        <path
          d="M0 0L6 6M6 0L0 6"
          stroke="rgba(127, 29, 29, 0.55)"
          strokeWidth="0.8"
        />
      </pattern>
      {/* midLow — 주황 + 큰 도트 */}
      <pattern
        id={patternIdForBucket(prefix, "midLow")}
        width="6"
        height="6"
        patternUnits="userSpaceOnUse"
      >
        <rect width="6" height="6" fill={ANALYTICS_PALETTE.heatMidLow} />
        <circle cx="3" cy="3" r="1.0" fill="rgba(120, 53, 15, 0.55)" />
      </pattern>
      {/* mid — 노랑 + 작은 도트 */}
      <pattern
        id={patternIdForBucket(prefix, "mid")}
        width="6"
        height="6"
        patternUnits="userSpaceOnUse"
      >
        <rect width="6" height="6" fill={ANALYTICS_PALETTE.heatMid} />
        <circle cx="3" cy="3" r="0.6" fill="rgba(120, 53, 15, 0.45)" />
      </pattern>
      {/* high — 연녹 + 사선 */}
      <pattern
        id={patternIdForBucket(prefix, "high")}
        width="6"
        height="6"
        patternUnits="userSpaceOnUse"
      >
        <rect width="6" height="6" fill={ANALYTICS_PALETTE.heatHigh} />
        <path
          d="M0 6L6 0"
          stroke="rgba(6, 78, 59, 0.50)"
          strokeWidth="0.9"
        />
      </pattern>
      {/* veryHigh — 진녹 + 사선 두 줄 */}
      <pattern
        id={patternIdForBucket(prefix, "veryHigh")}
        width="6"
        height="6"
        patternUnits="userSpaceOnUse"
      >
        <rect width="6" height="6" fill={ANALYTICS_PALETTE.heatVeryHigh} />
        <path
          d="M0 6L6 0M0 3L3 0M3 6L6 3"
          stroke="rgba(255, 255, 255, 0.45)"
          strokeWidth="0.7"
        />
      </pattern>
    </defs>
  );
}

/**
 * Per-segment heatmap (재생 구간) — 0(없음) ~ 1(가장 진함) 정규화 값을 받아서
 * 채도가 강한 골드 스케일을 만든다. 패턴 도배 시 슬라이드 라벨이 가려져 보조
 * 표지로만 사용 (ARIA + 마우스오버 caption 으로 색약자 보강).
 */
export function watchHeatColor(intensity: number): string {
  const clamped = Math.max(0, Math.min(1, intensity));
  // ElevenLabs 톤: 무채색 → 골드. 라이트 배경 위에서 가독성 위해 alpha 사용.
  const alpha = 0.08 + clamped * 0.55;
  return `rgba(184, 131, 8, ${alpha.toFixed(3)})`;
}
