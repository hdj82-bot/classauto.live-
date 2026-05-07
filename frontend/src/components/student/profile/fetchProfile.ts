"use client";

/**
 * /profile 페이지 데이터 로더.
 *
 * 백엔드에 단일 통합 endpoint 가 없는 (BACKEND_ASKS.PROFILE.md §1) 현 시점에서
 * 클라이언트가 여러 endpoint 를 fan-out 한 결과를 ProfileSnapshot 으로 정규화.
 * fan-out 자체가 모두 실패하면 mock 데이터로 graceful fallback — 신규 학생도
 * 페이지 형태를 미리 볼 수 있고 디자인 회귀 검증도 가능하다 (mocked=true 배지).
 *
 * 각 endpoint 별 안전성:
 *   - `/api/v1/sessions` (내 세션 목록) → 시청 통계 일부 추출 (실재 endpoint)
 *   - `/api/v1/profile/me` (가상) → 통합 응답 우선 시도, 실패 시 fan-out 으로 fallback
 *   - 인증서·격려·스트릭은 모두 BACKEND_ASKS 에 정리된 미구현 endpoint
 */

import { api } from "@/lib/api";
import type {
  Certificate,
  CourseProgress,
  Encouragement,
  LifetimeStats,
  ProfileSnapshot,
  RecentQuestion,
  StreakDay,
  StreakSummary,
  UserBasic,
} from "./types";

interface SessionEntry {
  id: string;
  lecture_id: string;
  status: string;
  watched_sec?: number;
  total_sec?: number;
  progress_pct?: number;
  started_at?: string | null;
}

const DAYS_WINDOW = 90;

export async function fetchProfileSnapshot(user: UserBasic): Promise<ProfileSnapshot> {
  // 통합 endpoint 시도. 실패는 silent — 곧장 fan-out 으로.
  try {
    const { data } = await api.get<ProfileSnapshot>("/api/v1/profile/me");
    if (data && data.user) return { ...data, mocked: false };
  } catch {
    /* fan-out 으로 진행 */
  }

  // fan-out — 현재 가용한 sessions endpoint 만 사용해 통계 일부 추출.
  const stats = await fetchStatsFromSessions();
  // 나머지 영역 (스트릭·인증서·격려·질문) 은 mock 으로 채움.
  return {
    user,
    streak: mockStreak(stats?.recentDates ?? []),
    stats: stats?.lifetime ?? mockLifetimeStats(),
    inProgress: stats?.inProgress ?? mockCoursesInProgress(),
    completed: stats?.completed ?? mockCoursesCompleted(),
    certificates: mockCertificates(),
    encouragements: mockEncouragements(),
    recentQuestions: mockRecentQuestions(),
    mocked: true,
  };
}

interface SessionDigest {
  lifetime: LifetimeStats;
  recentDates: string[];
  inProgress: CourseProgress[];
  completed: CourseProgress[];
}

async function fetchStatsFromSessions(): Promise<SessionDigest | null> {
  try {
    const { data } = await api.get<SessionEntry[]>("/api/v1/sessions");
    if (!Array.isArray(data) || data.length === 0) return null;
    let watchedSec = 0;
    let videosCompleted = 0;
    const recentDates: string[] = [];
    for (const s of data) {
      watchedSec += s.watched_sec ?? 0;
      if (s.status === "completed") videosCompleted += 1;
      if (s.started_at) recentDates.push(s.started_at.slice(0, 10));
    }
    // 강의별 진도는 endpoint 가 lecture meta 를 같이 주지 않으므로 본 PR 에서는
    // 단순화 — 강의 정보는 mock 으로 보강 (BACKEND_ASKS §1.1 통합 endpoint 가
    // 도착하면 실데이터로 자동 교체).
    return {
      lifetime: {
        watchedMinutes: Math.round(watchedSec / 60),
        videosCompleted,
        averageAccuracy: null,
        questionsSent: 0,
        encouragementsReceived: 0,
      },
      recentDates,
      inProgress: mockCoursesInProgress(),
      completed: mockCoursesCompleted(),
    };
  } catch {
    return null;
  }
}

// ── mocks ─────────────────────────────────────────────────────────────────

function todayUTC(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function shiftDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function mockStreak(actualDates: string[]): StreakSummary {
  const today = todayUTC();
  const start = shiftDays(today, -(DAYS_WINDOW - 1));
  const days: StreakDay[] = [];
  const actualSet = new Set(actualDates);
  // 결정론적 의사난수 — date 문자열을 해시해 0~3 의 분 단위 활동량으로 변환.
  const hash = (s: string) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  };
  for (let i = 0; i < DAYS_WINDOW; i++) {
    const d = isoDate(shiftDays(start, i));
    const fromHash = hash(d) % 5; // 0~4
    const minutes = actualSet.has(d) ? Math.max(15, fromHash * 8) : fromHash * 6;
    days.push({ date: d, watchedMinutes: minutes });
  }

  // 연속 일수 — 오늘부터 거꾸로 watchedMinutes>0 행진.
  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].watchedMinutes > 0) current += 1;
    else break;
  }
  // 최장 연속.
  let longest = 0;
  let run = 0;
  for (const d of days) {
    if (d.watchedMinutes > 0) {
      run += 1;
      if (run > longest) longest = run;
    } else run = 0;
  }
  // 이번 주.
  const weekStart = shiftDays(today, -((today.getUTCDay() + 7) % 7));
  let thisWeek = 0;
  for (let i = 0; i < 7; i++) {
    const di = isoDate(shiftDays(weekStart, i));
    const day = days.find((d) => d.date === di);
    if (day && day.watchedMinutes > 0) thisWeek += 1;
  }

  return {
    currentDays: current,
    longestDays: longest,
    thisWeekDays: thisWeek,
    days,
  };
}

function mockLifetimeStats(): LifetimeStats {
  return {
    watchedMinutes: 23 * 60,
    videosCompleted: 5,
    averageAccuracy: 82,
    questionsSent: 47,
    encouragementsReceived: 12,
  };
}

function mockCoursesInProgress(): CourseProgress[] {
  return [
    { courseId: "c-1", title: "현대중국사회의이해", percent: 78, lastWatchedAt: "2026-05-04" },
    { courseId: "c-2", title: "기초중국어듣기", percent: 45, lastWatchedAt: "2026-05-02" },
    { courseId: "c-3", title: "글로벌문화의이해", percent: 12, lastWatchedAt: "2026-04-28" },
  ];
}

function mockCoursesCompleted(): CourseProgress[] {
  return [
    { courseId: "c-9", title: "한자 한자성어 입문", percent: 100, lastWatchedAt: "2026-04-10" },
  ];
}

function mockCertificates(): Certificate[] {
  return [
    {
      id: "cert-1",
      courseId: "c-9",
      title: "한자 한자성어 입문",
      issuedAt: "2026-04-12",
      pdfUrl: null,
      shareUrl: null,
    },
  ];
}

function mockEncouragements(): Encouragement[] {
  return [
    {
      id: "enc-1",
      professor: "하두진",
      message: "지난 주 시청 진행률이 크게 올랐어요. 잘하고 있습니다 👏",
      receivedAt: "2026-05-03",
    },
  ];
}

function mockRecentQuestions(): RecentQuestion[] {
  return [
    {
      id: "q-1",
      question: "디지털 위안화와 비트코인의 가장 큰 차이는 무엇인가요?",
      inScope: true,
      responded: true,
      askedAt: "2026-05-04",
    },
    {
      id: "q-2",
      question: "이 강의 마지막 슬라이드가 잘 안 보였어요.",
      inScope: false,
      responded: false,
      askedAt: "2026-05-03",
    },
  ];
}
