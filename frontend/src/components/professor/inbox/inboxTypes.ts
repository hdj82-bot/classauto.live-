/**
 * Inbox 도메인 타입.
 *
 * 2026-05 redesign: 페이지가 "강의별 Q&A 종합 리포트" 로 단순화되면서 status
 * 분류·RAG 메타·교수자 확정 답변 흐름이 UI 에서 제거되었습니다. 그러나
 *   1) 백엔드 `/api/v1/dashboard/{lecture_id}/qa` 응답 스키마
 *   2) 기존 `__tests__/inbox/*` 단위 테스트
 * 와의 호환을 위해 타입 자체는 그대로 유지합니다.
 */

export type InboxStatus =
  | "auto_answered"
  | "needs_professor"
  | "off_topic_forwarded";

export interface InboxStudent {
  id: string;
  name: string | null;
  studentNumber?: string | null;
  email?: string | null;
}

export interface InboxLectureContext {
  lectureId: string;
  lectureTitle: string;
  courseId: string;
  courseTitle: string;
  timestampSec: number | null;
}

export interface InboxRagContext {
  topSlideNumbers: number[];
  topSimilarity: number | null;
  similarQuestionCount?: number;
}

export interface InboxItem {
  id: string;
  status: InboxStatus;
  inScope: boolean;
  professorAnswered: boolean;
  responded: boolean;

  question: string;
  /** 챗봇(자동 응답) 답변. 단순화된 UI 에서 이 값을 "챗봇 답변" 으로 노출. */
  aiDraft: string | null;
  professorAnswer: string | null;

  costUsd: number;
  createdAt: string;
  reviewedAt: string | null;

  student: InboxStudent;
  lecture: InboxLectureContext;
  rag: InboxRagContext;
}

export interface InboxFilters {
  courseId: string;
  lectureId: string;
  status: InboxStatus;
  unansweredOnly: boolean;
  sort: InboxSort;
  search: string;
}

export type InboxSort = "newest" | "oldest" | "similarity";

export interface InboxStatsSummary {
  total: number;
  byStatus: Record<InboxStatus, number>;
  unanswered: number;
  avgResponseHours?: number;
}

export interface InboxListResult {
  items: InboxItem[];
  stats: InboxStatsSummary;
  deferred: boolean;
}

export interface InboxAnswerPayload {
  body: string;
  notify: boolean;
  mode: "save" | "send";
}

export interface InboxAnswerResult {
  ok: boolean;
  deferred: boolean;
}

export interface InboxBulkConfirmPayload {
  ids: string[];
  useAiDraft: boolean;
  notify: boolean;
}

export interface InboxBulkConfirmResult {
  successIds: string[];
  failedIds: string[];
  deferred: boolean;
}

/** 종합 리포트 다운로드 스코프 — `all` 또는 특정 강의(course). */
export type InboxReportScope = "all" | { courseId: string };
