/**
 * Inbox 도메인 타입 — `BACKEND_ASKS.INBOX.md` 의 응답 스키마와 1:1 대응.
 *
 * 백엔드 미흡 시:
 *   - 새 `/api/v1/inbox` 엔드포인트가 도착하기 전까지는 `inboxApi.ts` 가
 *     `/api/v1/dashboard/{lecture_id}/qa` (강의별) 결과를 fan-out 해서
 *     이 형태로 합성합니다 (lectureTitle/courseTitle 은 `/api/courses` +
 *     `/api/courses/:id/lectures` 에서 join). 이로 인해 일부 필드 (학생 이름,
 *     슬라이드 미리보기) 는 비어있을 수 있고, UI 는 모두 `null/undefined`
 *     안전하게 렌더하도록 작성됨.
 */

/** 인박스 항목의 분류 — 기획서 §6.2 의 3개 탭. */
export type InboxStatus =
  | "auto_answered" // RAG 가 in-scope 으로 판정해 자동 응답한 건 (참고용 모니터링)
  | "needs_professor" // 학생 또는 교수자가 후속 응답이 필요하다고 표시한 건 (액션)
  | "off_topic_forwarded"; // RAG 가 out-of-scope 거부한 뒤 학생이 "교수님께 전달" 한 건

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
  /** 학생이 질문한 시점의 영상 재생 지점(초). 없으면 null. */
  timestampSec: number | null;
}

export interface InboxRagContext {
  /** RAG 가 retrieve 한 슬라이드 번호 (대표 1~3개). */
  topSlideNumbers: number[];
  /** 0~1 — 0.7 미만이면 in_scope=false. */
  topSimilarity: number | null;
  /** Pro: 동일 토픽으로 묶인 비슷한 질문 수. */
  similarQuestionCount?: number;
}

export interface InboxItem {
  id: string;
  status: InboxStatus;
  /** RAG in-scope 판정. status === "off_topic_forwarded" 면 항상 false. */
  inScope: boolean;
  /** 교수자가 확정 답변을 보낸 적이 있는가. */
  professorAnswered: boolean;
  /** 학생 측에 발송 (auto_answered 또는 교수자 확정) 되었는가. */
  responded: boolean;

  question: string;
  /** RAG 자동 초안 — out-of-scope 인 경우 null. */
  aiDraft: string | null;
  /** 교수자가 확정한 최종 답변 — null 이면 아직 미확정. */
  professorAnswer: string | null;

  costUsd: number;
  createdAt: string; // ISO 8601
  /** 교수자가 마지막으로 확인/응답한 시각. 미응답이면 null. */
  reviewedAt: string | null;

  student: InboxStudent;
  lecture: InboxLectureContext;
  rag: InboxRagContext;
}

export interface InboxFilters {
  /** "all" 또는 courseId. */
  courseId: string;
  /** "all" 또는 lectureId. */
  lectureId: string;
  /** 어떤 탭(=status). */
  status: InboxStatus;
  /** 미답변(professorAnswered === false) 만 보여줄지. */
  unansweredOnly: boolean;
  /** 정렬 기준. */
  sort: InboxSort;
  /** 자유 텍스트 검색 (질문 본문 contains). */
  search: string;
}

export type InboxSort = "newest" | "oldest" | "similarity";

export interface InboxStatsSummary {
  total: number;
  byStatus: Record<InboxStatus, number>;
  unanswered: number;
  /** Pro: 평균 교수자 응답 시간(시간 단위). */
  avgResponseHours?: number;
}

export interface InboxListResult {
  items: InboxItem[];
  stats: InboxStatsSummary;
  /** 백엔드가 아직 미연결이라 mock 데이터를 띄운 경우 true. */
  deferred: boolean;
}

/** 단건 답변 확정 API 요청. */
export interface InboxAnswerPayload {
  body: string;
  notify: boolean;
  /** "save" = 초안만 저장, "send" = 학생에게 전송 (responded=true). */
  mode: "save" | "send";
}

export interface InboxAnswerResult {
  ok: boolean;
  /** 백엔드 미연결 — 로컬 보관됨. */
  deferred: boolean;
}

/** 일괄 답변 확정 API 요청. */
export interface InboxBulkConfirmPayload {
  ids: string[];
  /** RAG 초안을 그대로 전송할지 (true 가 기획상 기본). */
  useAiDraft: boolean;
  notify: boolean;
}

export interface InboxBulkConfirmResult {
  successIds: string[];
  failedIds: string[];
  deferred: boolean;
}
