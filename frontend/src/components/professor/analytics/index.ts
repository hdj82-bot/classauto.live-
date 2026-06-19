/**
 * 교수자 분석 차트 컴포넌트 묶음 진입점.
 *
 * 통합 PR 후 `useI18n().t("analyticsHub.<key>")` 직접 호출로 마이그레이션 시
 * `useAnalyticsI18n` 만 제거하고 본 묶음은 그대로 유지된다.
 */
export { default as AttendanceChart } from "./AttendanceChart";
export { default as StudentProgressGrid } from "./StudentProgressGrid";
export { default as AttentionScore } from "./AttentionScore";
export { default as SummaryCards } from "./SummaryCards";
export { default as ScoreHeatmap } from "./ScoreHeatmap";
export { default as EngagementCurve } from "./EngagementCurve";
export { default as CostMeter } from "./CostMeter";
export { default as CsvExportButton } from "./CsvExportButton";
export { default as WatchHeatmap } from "./WatchHeatmap";
export { default as QaTrend } from "./QaTrend";
export { default as AchievementTrend } from "./AchievementTrend";
export { default as QaKeywords } from "./QaKeywords";
export { default as EmptyState } from "./EmptyState";
export { useAnalyticsI18n } from "./useAnalyticsI18n";
export type {
  AttendanceData,
  ScoresData,
  EngagementData,
  CostData,
  QAData,
  WatchHeatmapData,
  TrendData,
  QaKeywordsData,
} from "./types";
