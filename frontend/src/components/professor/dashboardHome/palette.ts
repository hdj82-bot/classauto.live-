/**
 * 대시보드 홈 색상 토큰.
 *
 * `frontend/src/components/professor/analytics/svg.tsx` 의 `ANALYTICS_PALETTE`
 * 와 의도적으로 같은 키·값을 갖는다. 두 워크트리가 별개로 머지될 수 있도록
 * 자체 사본을 들고 다니며, 통합 PR(W3 머지 후) 에 한 곳으로 흡수할 것을
 * MERGE_NOTES 에 적어두었다.
 *
 * 라이트 베이스에서 4.5:1 이상 대비를 가지는 톤만 사용. 골드는 라이트 위에서는
 * deep 톤(#B88308). 의미적 컬러는 colors.md §5 의 정의를 따른다.
 */
export const HUB_PALETTE = {
  bgCard: "#FFFFFF",
  border: "rgba(10, 10, 10, 0.10)",
  axis: "rgba(10, 10, 10, 0.40)",
  text: "#0A0A0A",
  textMuted: "rgba(10, 10, 10, 0.62)",
  // 시그니처 골드
  gold: "#B88308",
  goldBright: "#FFB627",
  goldSoft: "rgba(255, 182, 39, 0.15)",
  goldGlow: "rgba(255, 182, 39, 0.30)",
  // 의미적 컬러 (colors.md §5 — 교수자 영역만)
  warning: "#EF4444",
  success: "#10B981",
  info: "#3B82F6",
  neutral: "#6B7280",
} as const;

/**
 * StatCard 의 6 종류별 카테고리. sparkline / 글리프 / aria-label 에 활용.
 *
 * - 'positive' — 높을수록 좋음 (시청 완료율, 정답률, 활성 학습자)
 * - 'attention' — 낮은 게 정상이고 임계 초과 시 빨강 (미응답 Q&A)
 * - 'progress' — 진행 바 (이번 달 영상)
 * - 'cost' — 누적 비용 (그라데이션 바 별도)
 */
export type StatKind = "positive" | "attention" | "progress" | "cost";

export function colorForStatKind(
  kind: StatKind,
  warn?: boolean,
): string {
  if (warn) return HUB_PALETTE.warning;
  switch (kind) {
    case "positive":
      return HUB_PALETTE.success;
    case "attention":
      return HUB_PALETTE.warning;
    case "progress":
      return HUB_PALETTE.gold;
    case "cost":
      return HUB_PALETTE.gold;
  }
}
