/**
 * 백엔드 `/api/v1/dashboard/{lecture_id}/*` 응답 모양에 맞춘 type 정의.
 *
 * `backend/app/services/dashboard.py` 의 dict 반환을 그대로 거울링했다.
 * `data` shape 변경 시 본 파일 한 곳만 갱신하면 차트 전체가 따라간다.
 */

export interface AttendanceStudent {
  user_id: string;
  name: string | null;
  student_number: string | null;
  type: "live" | "vod";
  started_at: string | null;
  progress_pct: number;
  status: string;
}

export interface AttendanceData {
  lecture_id: string;
  live_deadline?: string;
  summary: { total: number; live: number; vod: number };
  students: AttendanceStudent[];
}

export interface ScoreCategoryRow {
  category: string;
  total: number;
  correct: number;
  accuracy: number;
}

export interface ScoreTypeRow {
  type: string;
  total: number;
  correct: number;
  accuracy: number;
}

export interface ScoreWrongRow {
  questionText: string;
  questionType: string;
  wrongCount: number;
  wrongAnswers: string[];
}

export interface ScoresData {
  lecture_id: string;
  totalQuestions: number;
  overallAccuracy: number;
  byType: ScoreTypeRow[];
  byCategory: ScoreCategoryRow[];
  wrongAnswerTop: ScoreWrongRow[];
}

export interface EngagementStudent {
  userId: string;
  name: string | null;
  student_number: string | null;
  qaCount: number;
  respondedCount: number;
  noResponseCnt: number;
  watchedSec: number;
  totalSec: number;
  watchRatio: number;
  responseRate: number | null;
}

export interface AttentionSummary {
  /** 학급 평균 집중도 점수(0~100). */
  score: number;
  /** 집중/보통/산만 학생 수 분포(도넛). */
  distribution: { focused: number; moderate: number; distracted: number };
}

export interface EngagementData {
  lecture_id: string;
  summary: {
    totalStudents: number;
    totalQAQuestions: number;
    overallResponseRate: number;
    totalNoResponseEvents: number;
    /** D(스펙 11 §D): 집중도 점수 + 분포. 구버전 응답엔 없을 수 있어 optional. */
    attention?: AttentionSummary;
  };
  students: EngagementStudent[];
}

export interface QALogRow {
  id: string;
  question: string;
  answer: string | null;
  in_scope: boolean;
  responded: boolean;
  cost_usd: number;
  created_at: string | null;
}

export interface QAData {
  lecture_id: string;
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  logs: QALogRow[];
}

export interface CostCategoryRow {
  category: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  count: number;
}

export interface CostData {
  lecture_id: string;
  summary: {
    totalRequests: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCostUsd: number;
  };
  byCategory: CostCategoryRow[];
}

/**
 * 현황 KPI + 전주 대비 델타 (스펙 11 §B) — `/api/v1/dashboard/{id}/kpi` 응답.
 * 일자 스냅샷 기반. delta 는 7일 이전 스냅샷이 없으면 null.
 */
export interface KpiItem {
  key: "completionRate" | "attendanceRate" | "avgAccuracy" | "qaCount";
  current: number;
  delta: number | null;
}

export interface KpiDeltaData {
  lecture_id: string;
  as_of: string | null;
  prev_as_of: string | null;
  kpis: KpiItem[];
}

/**
 * 성취율 추이 (스펙 11 §C) — `/api/v1/dashboard/{id}/trend` 응답.
 * 일배치가 적재한 강의×일자 누적 스냅샷. 비율 3종은 0~100(%).
 */
export interface TrendPoint {
  date: string;
  completionRate: number;
  attendanceRate: number;
  avgAccuracy: number;
  qaCount: number;
  activeLearners: number;
}

export interface TrendData {
  lecture_id: string;
  points: TrendPoint[];
}

/**
 * 빈번 질문어 (스펙 11 §G) — `/api/v1/dashboard/{id}/qa-keywords` 응답.
 * 학생 Q&A 질문에서 추출한 키워드 빈도. lang 으로 한/중/영 칩 구분.
 */
export interface QaKeyword {
  term: string;
  lang: "ko" | "zh" | "en";
  count: number;
}

export interface QaKeywordsData {
  lecture_id: string;
  totalQuestions: number;
  keywords: QaKeyword[];
}

/**
 * 학습 목표·달성률 (스펙 11 §H-3) — `/api/v1/dashboard/{id}/goals`.
 * baseline(before) → current(after) → target 비교. progress_pct 0~100.
 */
export type GoalMetric =
  | "completionRate"
  | "attendanceRate"
  | "avgAccuracy"
  | "qaCount";

export interface Goal {
  id: string;
  lecture_id: string;
  metric: GoalMetric;
  label: string;
  target_value: number;
  baseline_value: number | null;
  current_value: number;
  progress_pct: number;
  achieved: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * 교수자 개입 행동 로그 (스펙 11 §H-4, RQ2) — `/api/v1/dashboard/{id}/actions`.
 * 격려·권고 채택·메모. 실제 외부 발송 채널은 후속(status='recorded').
 */
export type ActionType = "encouragement" | "adopt_recommendation" | "note";

export interface InstructorAction {
  id: string;
  lecture_id: string;
  instructor_id: string;
  action_type: ActionType;
  target_user_id: string | null;
  target_name: string | null;
  message: string | null;
  status: string;
  created_at: string;
}

/**
 * Watch heatmap raw shape — 백엔드가 아직 노출하지 않는다.
 * BACKEND_ASKS.ANALYTICS.md 에 정리된 협의안. 도착 전까지는 어떤 응답에도
 * 이 키가 없으므로 컴포넌트는 "준비 중" fallback 으로 분기한다.
 */
export interface WatchHeatmapSlide {
  index: number;
  replays: number;
  drops: number;
  durationSec?: number;
}

export interface WatchHeatmapData {
  lecture_id: string;
  slides: WatchHeatmapSlide[];
}
