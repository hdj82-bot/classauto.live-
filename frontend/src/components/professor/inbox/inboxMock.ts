import type { InboxItem, InboxStatsSummary } from "./inboxTypes";

/**
 * Inbox 백엔드 미연결 상태에서 UI 가 살아있도록 띄우는 프리뷰 데이터.
 *
 * - 모든 텍스트 (강의명·학생명·질문·답변) 는 i18n 키 (`inbox.mock.*`) 로 빼서
 *   ko/en 패치에서 번역 가능하게 해두었습니다. 본 모듈은 그 키만 들고 있고,
 *   실제 텍스트 렌더는 컴포넌트가 `t(item.<field>I18nKey)` 로 처리합니다.
 * - 시간 (`createdAt`) 은 모듈 import 시점 기준 상대 시각으로 계산해 "x분 전"
 *   같은 표현이 자연스럽도록 합니다.
 * - mock 데이터는 backend 가 도착하면 자동으로 `inboxApi.list()` 의 1차 경로가
 *   채택되므로 더 이상 사용되지 않습니다.
 */

export interface MockInboxSeed extends Omit<InboxItem, "question" | "aiDraft" | "professorAnswer" | "lecture" | "student"> {
  /** i18n key under `inbox.mock.questions.*` */
  questionI18nKey: string;
  /** i18n key under `inbox.mock.answers.*` — null 인 경우 출력 안 함. */
  aiDraftI18nKey: string | null;
  /** 교수자 확정 답변. 현재는 모두 null (UI 가 confirm 흐름을 보여주기 위함). */
  professorAnswerI18nKey: string | null;

  /** course / lecture / student 도 i18n 키로 보관. */
  courseId: string;
  courseI18nKey: string;
  lectureId: string;
  lectureI18nKey: string;
  studentId: string;
  studentI18nKey: string;
  studentNumber?: string;
}

/** 분 단위 과거를 ISO 로 환산. */
function ago(min: number): string {
  return new Date(Date.now() - min * 60_000).toISOString();
}

export const MOCK_INBOX_SEEDS: MockInboxSeed[] = [
  // ── 교수자 응답 필요 (액션 아이템) ──────────────────────────────────────
  {
    id: "qa-needs-1",
    status: "needs_professor",
    inScope: true,
    professorAnswered: false,
    responded: true,
    questionI18nKey: "questions.q3",
    aiDraftI18nKey: "answers.a3",
    professorAnswerI18nKey: null,
    costUsd: 0.0042,
    createdAt: ago(18),
    reviewedAt: null,
    courseId: "course-ccs",
    courseI18nKey: "courses.ccs",
    lectureId: "lec-ccs-2",
    lectureI18nKey: "lectures.ccs2",
    studentId: "stu-park",
    studentI18nKey: "students.park",
    studentNumber: "201912345",
    rag: {
      topSlideNumbers: [7, 8, 9],
      topSimilarity: 0.78,
      similarQuestionCount: 4,
    },
  },
  {
    id: "qa-needs-2",
    status: "needs_professor",
    inScope: true,
    professorAnswered: false,
    responded: true,
    questionI18nKey: "questions.q2",
    aiDraftI18nKey: "answers.a2",
    professorAnswerI18nKey: null,
    costUsd: 0.0036,
    createdAt: ago(72),
    reviewedAt: null,
    courseId: "course-ccs",
    courseI18nKey: "courses.ccs",
    lectureId: "lec-ccs-1",
    lectureI18nKey: "lectures.ccs1",
    studentId: "stu-lee",
    studentI18nKey: "students.lee",
    studentNumber: "202012001",
    rag: {
      topSlideNumbers: [4, 5],
      topSimilarity: 0.81,
      similarQuestionCount: 1,
    },
  },
  {
    id: "qa-needs-3",
    status: "needs_professor",
    inScope: true,
    professorAnswered: false,
    responded: true,
    questionI18nKey: "questions.q5",
    aiDraftI18nKey: null,
    professorAnswerI18nKey: null,
    costUsd: 0.0028,
    createdAt: ago(220),
    reviewedAt: null,
    courseId: "course-corpus",
    courseI18nKey: "courses.corpus",
    lectureId: "lec-corpus-1",
    lectureI18nKey: "lectures.corpus1",
    studentId: "stu-jung",
    studentI18nKey: "students.jung",
    rag: {
      topSlideNumbers: [12],
      topSimilarity: 0.71,
    },
  },

  // ── AI 자동응답 (참고용 모니터링) ──────────────────────────────────────
  {
    id: "qa-auto-1",
    status: "auto_answered",
    inScope: true,
    professorAnswered: false,
    responded: true,
    questionI18nKey: "questions.q1",
    aiDraftI18nKey: "answers.a1",
    professorAnswerI18nKey: null,
    costUsd: 0.0051,
    createdAt: ago(5),
    reviewedAt: null,
    courseId: "course-ccs",
    courseI18nKey: "courses.ccs",
    lectureId: "lec-ccs-1",
    lectureI18nKey: "lectures.ccs1",
    studentId: "stu-kim",
    studentI18nKey: "students.kim",
    studentNumber: "201899001",
    rag: {
      topSlideNumbers: [2, 3],
      topSimilarity: 0.92,
      similarQuestionCount: 12,
    },
  },
  {
    id: "qa-auto-2",
    status: "auto_answered",
    inScope: true,
    professorAnswered: false,
    responded: true,
    questionI18nKey: "questions.q4",
    aiDraftI18nKey: "answers.a4",
    professorAnswerI18nKey: null,
    costUsd: 0.0047,
    createdAt: ago(95),
    reviewedAt: null,
    courseId: "course-trans",
    courseI18nKey: "courses.trans",
    lectureId: "lec-trans-1",
    lectureI18nKey: "lectures.trans1",
    studentId: "stu-choi",
    studentI18nKey: "students.choi",
    rag: {
      topSlideNumbers: [10, 11],
      topSimilarity: 0.86,
    },
  },

  // ── 범위 외 거부 (학생이 교수자에게 전달) ─────────────────────────────
  {
    id: "qa-off-1",
    status: "off_topic_forwarded",
    inScope: false,
    professorAnswered: false,
    responded: false,
    questionI18nKey: "questions.q6",
    aiDraftI18nKey: null,
    professorAnswerI18nKey: null,
    costUsd: 0.0009,
    createdAt: ago(40),
    reviewedAt: null,
    courseId: "course-ccs",
    courseI18nKey: "courses.ccs",
    lectureId: "lec-ccs-1",
    lectureI18nKey: "lectures.ccs1",
    studentId: "stu-kim",
    studentI18nKey: "students.kim",
    rag: {
      topSlideNumbers: [],
      topSimilarity: 0.42,
    },
  },
  {
    id: "qa-off-2",
    status: "off_topic_forwarded",
    inScope: false,
    professorAnswered: false,
    responded: false,
    questionI18nKey: "questions.q7",
    aiDraftI18nKey: null,
    professorAnswerI18nKey: null,
    costUsd: 0.0011,
    createdAt: ago(380),
    reviewedAt: null,
    courseId: "course-ccs",
    courseI18nKey: "courses.ccs",
    lectureId: "lec-ccs-1",
    lectureI18nKey: "lectures.ccs1",
    studentId: "stu-park",
    studentI18nKey: "students.park",
    rag: {
      topSlideNumbers: [],
      topSimilarity: 0.55,
    },
  },
  {
    id: "qa-off-3",
    status: "off_topic_forwarded",
    inScope: false,
    professorAnswered: false,
    responded: false,
    questionI18nKey: "questions.q8",
    aiDraftI18nKey: null,
    professorAnswerI18nKey: null,
    costUsd: 0.0007,
    createdAt: ago(1440),
    reviewedAt: null,
    courseId: "course-trans",
    courseI18nKey: "courses.trans",
    lectureId: "lec-trans-1",
    lectureI18nKey: "lectures.trans1",
    studentId: "stu-jung",
    studentI18nKey: "students.jung",
    rag: {
      topSlideNumbers: [],
      topSimilarity: 0.31,
    },
  },
];

/** Mock 합산 통계 — `inboxApi.list` 가 mock 경로에서 직접 사용. */
export function computeMockStats(items: { status: InboxItem["status"]; professorAnswered: boolean }[]): InboxStatsSummary {
  const byStatus = {
    auto_answered: 0,
    needs_professor: 0,
    off_topic_forwarded: 0,
  } as Record<InboxItem["status"], number>;
  let unanswered = 0;
  for (const it of items) {
    byStatus[it.status]++;
    if (!it.professorAnswered) unanswered++;
  }
  return {
    total: items.length,
    byStatus,
    unanswered,
    avgResponseHours: 6.4,
  };
}
