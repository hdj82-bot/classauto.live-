import type {
  AttendanceStudent,
  EngagementStudent,
  LearnerRow,
} from "./types";

/**
 * 학습자 위험도 분류.
 *
 * - completed : status 가 "completed" 이거나 progress 100%
 * - high      : 진행률 < 30% **또는** 마지막 활동이 3일 이상 지난 경우
 * - medium    : 진행률 30~70%, 또는 watchRatio < 50% (얕은 시청)
 * - low       : 그 외 (진행률 70%+ & watchRatio 양호)
 *
 * 임계값은 docs/planning/05-instructor-pages.md §4.4 "시청 부진 학습자
 * (3일 이상 미시청)" 와 docs/planning/02-guardrails.md §6 (이상 패턴) 기준.
 */
export type RiskLevel = "completed" | "high" | "medium" | "low";

export interface RiskInputs {
  progressPct: number;
  watchRatio: number;
  status: string | null;
  startedAt: string | null;
  /** 테스트용 — 평소엔 Date.now() 사용 */
  now?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function computeRisk(input: RiskInputs): RiskLevel {
  const { progressPct, watchRatio, status, startedAt } = input;
  const now = input.now ?? Date.now();

  if (status === "completed" || progressPct >= 100) {
    return "completed";
  }

  // 마지막 활동(startedAt) 이 3일 이상 지났고 진행률이 100% 미만이면 고위험.
  // started_at 이 없으면 시청 자체가 없음 → high.
  if (!startedAt) return "high";
  const last = Date.parse(startedAt);
  if (Number.isFinite(last)) {
    const daysIdle = (now - last) / DAY_MS;
    if (daysIdle >= 3 && progressPct < 100) return "high";
  }

  if (progressPct < 30) return "high";
  if (progressPct < 70 || watchRatio < 50) return "medium";
  return "low";
}

/**
 * attendance + engagement 두 응답을 user_id 기준으로 머지해서 LearnerRow[] 생성.
 *
 * - attendance 만 있는 학생도, engagement 만 있는 학생도 모두 포함 (정상적으로는
 *   두 endpoint 가 같은 LearningSession 테이블에서 파생되므로 합집합이 합리적).
 * - 백엔드가 단일 `GET /lectures/{id}/learners` 를 제공하기 시작하면 이 함수가
 *   사라진다 — BACKEND_ASKS.LEARNERS.md §1 참조.
 */
export function mergeLearnerRows(
  attendance: AttendanceStudent[] | undefined,
  engagement: EngagementStudent[] | undefined,
): LearnerRow[] {
  const map = new Map<string, LearnerRow>();

  for (const a of attendance ?? []) {
    map.set(a.user_id, {
      userId: a.user_id,
      name: a.name,
      studentNumber: a.student_number ?? null,
      progressPct: a.progress_pct ?? 0,
      watchRatio: 0,
      qaCount: 0,
      respondedCount: 0,
      responseRate: null,
      noResponseCnt: 0,
      watchedSec: 0,
      totalSec: 0,
      attendanceType: a.type ?? null,
      startedAt: a.started_at ?? null,
      status: a.status ?? null,
    });
  }

  for (const e of engagement ?? []) {
    const existing = map.get(e.userId);
    if (existing) {
      existing.watchRatio = e.watchRatio ?? 0;
      existing.qaCount = e.qaCount ?? 0;
      existing.respondedCount = e.respondedCount ?? 0;
      existing.responseRate = e.responseRate ?? null;
      existing.noResponseCnt = e.noResponseCnt ?? 0;
      existing.watchedSec = e.watchedSec ?? 0;
      existing.totalSec = e.totalSec ?? 0;
      // engagement 가 더 정확한 이름/학번을 갖고 있으면 보강
      if (!existing.name && e.name) existing.name = e.name;
      if (!existing.studentNumber && e.student_number) {
        existing.studentNumber = e.student_number;
      }
    } else {
      map.set(e.userId, {
        userId: e.userId,
        name: e.name,
        studentNumber: e.student_number ?? null,
        progressPct: 0,
        watchRatio: e.watchRatio ?? 0,
        qaCount: e.qaCount ?? 0,
        respondedCount: e.respondedCount ?? 0,
        responseRate: e.responseRate ?? null,
        noResponseCnt: e.noResponseCnt ?? 0,
        watchedSec: e.watchedSec ?? 0,
        totalSec: e.totalSec ?? 0,
        attendanceType: null,
        startedAt: null,
        status: null,
      });
    }
  }

  return Array.from(map.values());
}

/**
 * 마지막 활동에서 며칠 지났는지(소수점 버림). startedAt 가 없거나 파싱
 * 실패면 null.
 */
export function daysSince(startedAt: string | null, now = Date.now()): number | null {
  if (!startedAt) return null;
  const t = Date.parse(startedAt);
  if (!Number.isFinite(t)) return null;
  const diff = now - t;
  if (diff < 0) return 0;
  return Math.floor(diff / DAY_MS);
}
