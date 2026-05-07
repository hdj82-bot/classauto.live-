/**
 * 대시보드 홈 — fan-out 집계 타입 정의.
 *
 * `dashboard.py` 의 6 endpoint 가 모두 lecture_id 단위라 클라이언트에서
 * 강의 전체 합계를 만든다(`aggregate.ts`). 이 모듈은 그 결과 shape 의 단일
 * 진실. 추후 백엔드가 단일 합계 endpoint 를 노출하면 본 타입을 그대로 받게
 * 된다(BACKEND_ASKS.DASHBOARDHUB.md §1).
 */

export interface PerLectureAttendance {
  lectureId: string;
  total: number;
  live: number;
  vod: number;
  completedCount: number; // status === "completed"
  inProgressCount: number; // status === "in_progress"
  notStartedCount: number; // status === "not_started" 또는 알수없음
  avgProgressPct: number;
  /** 시청 완료율 = completed / total * 100 */
  watchCompletionPct: number;
}

export interface PerLectureScores {
  lectureId: string;
  totalQuestions: number;
  overallAccuracy: number;
}

export interface PerLectureEngagement {
  lectureId: string;
  totalStudents: number;
  totalQAQuestions: number;
  overallResponseRate: number; // 0-100
  totalNoResponseEvents: number;
  uniqueUserIds: string[]; // 세션 기준 unique 학습자
}

export interface PerLectureCost {
  lectureId: string;
  totalRequests: number;
  totalCostUsd: number;
}

export interface PendingQaItem {
  id: string;
  lectureId: string;
  question: string;
  inScope: boolean;
  createdAt: string | null;
}

export interface RecentActivity {
  id: string;
  lectureId: string;
  kind: "qa-asked" | "qa-responded" | "qa-out-of-scope";
  /** Q&A 응답에 user_id / 학생명이 없어 임시로 question 본문 일부를 사용 */
  excerpt: string;
  createdAt: string | null;
}

/**
 * 대시보드 홈 상단 6 stat 카드의 입력값.
 *
 * delta 는 `null` 이면 백엔드 미지원 / 추이 데이터 없음 → "전주 대비 변동 없음"
 * 표시. trend 는 7-point 배열(최신 = 마지막). 모두 null 이면 sparkline 미표시.
 */
export interface DashboardStats {
  watchCompletionPct: number;
  avgAccuracyPct: number;
  pendingQaCount: number;
  activeLearners: number;
  monthlyVideoCount: number;
  monthlyVideoLimit: number | null;
  totalCostUsd: number;
  monthlyCostLimitUsd: number | null;

  // 변화량 / sparkline (백엔드 지원 시 채워짐)
  watchDeltaPct: number | null;
  accuracyDeltaPct: number | null;
  pendingQaDelta: number | null;
  activeDeltaPct: number | null;

  watchTrend: number[] | null;
  accuracyTrend: number[] | null;
  pendingQaTrend: number[] | null;
  activeTrend: number[] | null;
  costTrend: number[] | null;
}

export interface AttentionData {
  pendingQa: PendingQaItem[];
  laggingLearners: Array<{
    userId: string;
    name: string | null;
    daysSinceLastActivity: number | null;
  }>;
  frequentPauseSlides: Array<{
    lectureId: string;
    slideIndex: number;
    replays: number;
  }>;
}

export interface MainChartLectureSeries {
  lectureId: string;
  title: string;
  /**
   * 주차별 평균 완료율(0-100). 길이는 최대 12. null = 데이터 없음(점프 표시
   * 대신 끊긴 라인으로 그림).
   */
  weeklyCompletion: Array<number | null>;
}

/**
 * 도넛 차트 (학습자 진도 분포). 합쳐서 sum === 100% 가 보장되도록 클라이언트
 * 측에서 정규화한다.
 */
export interface DonutSegments {
  completed: number;
  inProgress: number;
  notStarted: number;
  total: number;
}

export interface DashboardHubData {
  stats: DashboardStats;
  attention: AttentionData;
  activity: RecentActivity[];
  mainChart: MainChartLectureSeries[];
  donut: DonutSegments;
  /** 어떤 endpoint 가 실패했는지 — 부분 fallback 노출용 */
  failures: {
    attendance: boolean;
    scores: boolean;
    engagement: boolean;
    qa: boolean;
    cost: boolean;
  };
}
