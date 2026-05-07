/**
 * Profile 화면 데이터 타입.
 *
 * 백엔드에 단일 endpoint 가 없는 (BACKEND_ASKS.PROFILE.md §1) 현 시점에서는
 * 클라이언트가 여러 endpoint 를 fan-out 하거나 mock 으로 대체한 결과를
 * 본 ProfileSnapshot 형태로 정규화해 컴포넌트에 전달한다.
 */

export interface UserBasic {
  id: string;
  email: string;
  name: string;
  school?: string | null;
  department?: string | null;
  studentNumber?: string | null;
  year?: number | null;
}

/** 1주짜리 셀 = 하루. ISO date (YYYY-MM-DD) 문자열을 키로. */
export interface StreakDay {
  date: string;
  /** 그 날 학습한 분 (0이면 미학습). */
  watchedMinutes: number;
}

export interface StreakSummary {
  /** 오늘 기준 연속 학습 일수. */
  currentDays: number;
  /** 최장 연속 일수. */
  longestDays: number;
  /** 이번 주 학습 일수. */
  thisWeekDays: number;
  /** 최근 N일 (보통 90~365). */
  days: StreakDay[];
}

export interface LifetimeStats {
  watchedMinutes: number;
  videosCompleted: number;
  /** 0~100. null = 데이터 없음. */
  averageAccuracy: number | null;
  questionsSent: number;
  encouragementsReceived: number;
}

export interface CourseProgress {
  courseId: string;
  title: string;
  /** 0~100. */
  percent: number;
  lastWatchedAt: string | null;
}

export interface Certificate {
  id: string;
  courseId: string;
  title: string;
  issuedAt: string;
  /** PDF 다운로드 URL — 백엔드 미구현 시 null (UI 가 "준비 중" 안내). */
  pdfUrl: string | null;
  /** 외부 공유용 인증서 페이지 URL (학생 본인 권한). null 시 비활성. */
  shareUrl: string | null;
}

export interface Encouragement {
  id: string;
  professor: string;
  message: string;
  receivedAt: string;
}

export interface RecentQuestion {
  id: string;
  question: string;
  inScope: boolean;
  responded: boolean;
  askedAt: string;
}

/** UI 가 다루는 통합 스냅샷. */
export interface ProfileSnapshot {
  user: UserBasic;
  streak: StreakSummary;
  stats: LifetimeStats;
  inProgress: CourseProgress[];
  completed: CourseProgress[];
  certificates: Certificate[];
  encouragements: Encouragement[];
  recentQuestions: RecentQuestion[];
  /** 백엔드 응답 없이 mock 데이터로 채워졌는지. UI 가 "샘플 데이터" 배지 노출. */
  mocked: boolean;
}
