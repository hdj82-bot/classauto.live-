/**
 * 대시보드 홈 컴포넌트 묶음 진입점.
 *
 * 통합 PR 머지 후 `useDashboardHubI18n` 만 정리하면 본 묶음 (StatCard,
 * MainChart, Donut, AttentionWidget, ActivityFeed, CostMeterBar) 은 그대로
 * 재사용 가능. `palette.ts` 는 W3 analytics 와 머지 시 한 곳으로 통합 권장
 * (MERGE_NOTES.DASHBOARDHUB.md 참조).
 */
export { default as StatCard } from "./StatCard";
export { default as StatGrid } from "./StatGrid";
export { default as Sparkline } from "./Sparkline";
export { default as MainChart } from "./MainChart";
export { default as Donut } from "./Donut";
export { default as CostMeterBar } from "./CostMeterBar";
export { default as AttentionWidget } from "./AttentionWidget";
export { default as ActivityFeed } from "./ActivityFeed";
export { useDashboardHubI18n } from "./useDashboardHubI18n";
export { useCountUp } from "./useCountUp";
export { aggregateDashboardHub } from "./aggregate";
export type {
  DashboardStats,
  DashboardHubData,
  AttentionData,
  RecentActivity,
  MainChartLectureSeries,
  DonutSegments,
} from "./types";
