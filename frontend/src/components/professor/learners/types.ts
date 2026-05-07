/**
 * 학습자 화면에서 사용하는 공통 타입.
 *
 * 백엔드 응답을 그대로 옮기지 않고, attendance + engagement 두 endpoint 에서
 * 추출한 필드를 학생 단위(`LearnerRow`)로 합쳐둔다 — 추후 단일 endpoint 가
 * 생기면 변환 함수만 갈아끼우면 된다 (BACKEND_ASKS.LEARNERS.md 참조).
 */

export type AttendanceType = "live" | "vod";

/** GET /api/v1/dashboard/{lectureId}/attendance — students[] 항목 */
export interface AttendanceStudent {
  user_id: string;
  name: string;
  student_number: string | null;
  type: AttendanceType;
  started_at: string | null;
  progress_pct: number;
  status: string;
}

/** GET /api/v1/dashboard/{lectureId}/engagement — students[] 항목 */
export interface EngagementStudent {
  userId: string;
  name: string;
  student_number: string | null;
  qaCount: number;
  respondedCount: number;
  noResponseCnt: number;
  watchedSec: number;
  totalSec: number;
  responseRate: number | null;
  watchRatio: number;
}

/** UI 컴포넌트가 다루는 통합 학습자 row. */
export interface LearnerRow {
  userId: string;
  name: string;
  studentNumber: string | null;
  progressPct: number;
  watchRatio: number;
  qaCount: number;
  respondedCount: number;
  responseRate: number | null;
  noResponseCnt: number;
  watchedSec: number;
  totalSec: number;
  attendanceType: AttendanceType | null;
  startedAt: string | null;
  status: string | null;
}
