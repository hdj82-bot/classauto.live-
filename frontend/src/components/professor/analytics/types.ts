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
