/**
 * 인사이트 보고서 컴포넌트 묶음 진입점 — `/professor/analytics/[id]/report`.
 */
export { default as EvidenceStrip } from "./EvidenceStrip";
export { default as WeakConceptList } from "./WeakConceptList";
export { default as RecommendationCards } from "./RecommendationCards";
export { default as ClassVsIndividual } from "./ClassVsIndividual";
export { default as InsightsCsvButton } from "./InsightsCsvButton";
export { useInsightsI18n } from "./useInsightsI18n";
export { withHan } from "./han";
export type {
  InsightsReport,
  Briefing,
  BriefingPayload,
  WeakConcept,
  Recommendation,
  ReportEvidence,
} from "./types";
