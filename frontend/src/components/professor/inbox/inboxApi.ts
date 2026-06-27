"use client";

import { api } from "@/lib/api";
import type { AxiosError } from "axios";
import {
  type InboxAnswerPayload,
  type InboxAnswerResult,
  type InboxBulkConfirmPayload,
  type InboxBulkConfirmResult,
  type InboxItem,
  type InboxListResult,
  type InboxReportScope,
  type InboxStatus,
} from "./inboxTypes";
import { MOCK_INBOX_SEEDS, computeMockStats, type MockInboxSeed } from "./inboxMock";

/**
 * Inbox API 클라이언트 — backend 미구현 단계에서도 UI 가 살아있도록 정교한
 * fallback 체인을 갖는다.
 *
 *   list(): 1) `/api/v1/inbox` (기획 우선 — `BACKEND_ASKS.INBOX.md` §1)
 *           2) `/api/courses` + `/api/courses/:id/lectures` +
 *              `/api/v1/dashboard/{lecture_id}/qa` 를 fan-out 해 합성
 *           3) 위 둘 다 실패 → mock seed 반환 (deferred=true)
 *
 *   answer(): 1) `PATCH /api/v1/inbox/{id}/answer`
 *             2) 실패 → 로컬 보관 (deferred=true). UI 는 토스트로 안내.
 *
 *   bulkConfirm(): 1) `POST /api/v1/inbox/bulk-confirm`
 *                  2) 실패 → 모두 deferred 처리.
 *
 * `localStore` 는 sessionStorage 기반 — localStorage 사용 금지 (CLAUDE.md).
 * SSR 안전성: window 미존재 시 in-memory fallback.
 */

interface DashboardQaLogRaw {
  id: string;
  question: string;
  answer: string | null;
  in_scope: boolean;
  responded: boolean;
  cost_usd: number;
  created_at: string | null;
}

interface DashboardQaResponse {
  lecture_id: string;
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  logs: DashboardQaLogRaw[];
}

interface CourseRaw {
  id: string;
  title: string;
}

interface LectureRaw {
  id: string;
  title: string;
  slug?: string;
  is_published?: boolean;
}

// ── Local override store (deferred 모드) ────────────────────────────────────

const STORE_KEY = "ifl-inbox-overrides";

type LocalOverride = {
  professorAnswer?: string;
  professorAnswered?: boolean;
  responded?: boolean;
  reviewedAt?: string;
  status?: InboxStatus;
};

type LocalStore = Record<string, LocalOverride>;

let memoryStore: LocalStore = {};

function readStore(): LocalStore {
  if (typeof window === "undefined") return memoryStore;
  try {
    const raw = window.sessionStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as LocalStore;
    return {};
  } catch {
    return {};
  }
}

function writeStore(store: LocalStore): void {
  memoryStore = store;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* quota / disabled — 메모리 fallback 만 갱신 */
  }
}

function applyOverrides(items: InboxItem[]): InboxItem[] {
  const store = readStore();
  return items.map((it) => {
    const ov = store[it.id];
    if (!ov) return it;
    return {
      ...it,
      professorAnswer: ov.professorAnswer ?? it.professorAnswer,
      professorAnswered:
        ov.professorAnswered ?? it.professorAnswered,
      responded: ov.responded ?? it.responded,
      reviewedAt: ov.reviewedAt ?? it.reviewedAt,
      status: ov.status ?? it.status,
    };
  });
}

// ── Mock 합성 ───────────────────────────────────────────────────────────────

/** mock seed → InboxItem (i18n 텍스트 주입은 컴포넌트가 담당하므로 여기선 키로) */
export interface MockResolveOptions {
  /** seed 의 i18nKey → 실제 문자열 변환 함수. 미제공 시 키를 그대로 텍스트로. */
  resolve?: (key: string) => string;
}

export function buildMockItems(opts: MockResolveOptions = {}): InboxItem[] {
  const r = opts.resolve ?? ((key) => key);
  return MOCK_INBOX_SEEDS.map((seed: MockInboxSeed) => ({
    id: seed.id,
    status: seed.status,
    inScope: seed.inScope,
    professorAnswered: seed.professorAnswered,
    responded: seed.responded,
    question: r(`mock.${seed.questionI18nKey}`),
    aiDraft: seed.aiDraftI18nKey ? r(`mock.${seed.aiDraftI18nKey}`) : null,
    professorAnswer: seed.professorAnswerI18nKey
      ? r(`mock.${seed.professorAnswerI18nKey}`)
      : null,
    costUsd: seed.costUsd,
    createdAt: seed.createdAt,
    reviewedAt: seed.reviewedAt,
    student: {
      id: seed.studentId,
      name: r(`mock.${seed.studentI18nKey}`),
      studentNumber: seed.studentNumber ?? null,
    },
    lecture: {
      lectureId: seed.lectureId,
      lectureTitle: r(`mock.${seed.lectureI18nKey}`),
      courseId: seed.courseId,
      courseTitle: r(`mock.${seed.courseI18nKey}`),
      timestampSec: null,
    },
    rag: seed.rag,
  }));
}

function buildMockResult(opts: MockResolveOptions): InboxListResult {
  const items = applyOverrides(buildMockItems(opts));
  return {
    items,
    stats: computeMockStats(items),
    deferred: true,
  };
}

// ── Composite fallback (per-lecture dashboard QA fan-out) ───────────────────

/**
 * Map a dashboard QA log to a partial InboxItem. Status inference:
 *   - `in_scope === false` → off_topic_forwarded (학생 forward 여부는 모르지만,
 *     인박스에서는 거부된 질문도 노출 대상이라 보수적으로 forwarded 로 분류)
 *   - `in_scope && responded` → auto_answered
 *   - `in_scope && !responded` → needs_professor
 */
function fromDashboardLog(
  log: DashboardQaLogRaw,
  lecture: LectureRaw,
  course: CourseRaw,
): InboxItem {
  let status: InboxStatus;
  if (!log.in_scope) status = "off_topic_forwarded";
  else if (log.responded) status = "auto_answered";
  else status = "needs_professor";

  return {
    id: log.id,
    status,
    inScope: log.in_scope,
    professorAnswered: false,
    responded: log.responded,
    question: log.question,
    aiDraft: log.answer,
    professorAnswer: null,
    costUsd: log.cost_usd ?? 0,
    createdAt: log.created_at ?? new Date().toISOString(),
    reviewedAt: null,
    student: {
      id: "unknown",
      name: null,
      studentNumber: null,
    },
    lecture: {
      lectureId: lecture.id,
      lectureTitle: lecture.title,
      courseId: course.id,
      courseTitle: course.title,
      timestampSec: null,
    },
    rag: {
      topSlideNumbers: [],
      topSimilarity: null,
    },
  };
}

function summarise(items: InboxItem[]) {
  const byStatus = {
    auto_answered: 0,
    needs_professor: 0,
    off_topic_forwarded: 0,
  } as Record<InboxStatus, number>;
  let unanswered = 0;
  for (const it of items) {
    byStatus[it.status]++;
    if (!it.professorAnswered) unanswered++;
  }
  return { total: items.length, byStatus, unanswered };
}

async function listFromDashboardFanout(): Promise<InboxItem[] | null> {
  try {
    const { data: courses } = await api.get<CourseRaw[]>("/api/courses", {
      timeout: 12000,
    });
    if (!Array.isArray(courses) || courses.length === 0) return [];
    // 종전엔 course→lecture→qa 를 3중 직렬 루프(O(C×L) 순차 왕복)로 돌아 느렸다.
    // 두 단계 모두 병렬(Promise.all)로 바꾸고 실패는 빈 배열로 흡수한다(동작 동일).
    const perCourse = await Promise.all(
      courses.map(async (course) => {
        let lectures: LectureRaw[] = [];
        try {
          const { data } = await api.get<LectureRaw[]>(
            `/api/courses/${course.id}/lectures`,
            { timeout: 12000 },
          );
          lectures = Array.isArray(data) ? data : [];
        } catch {
          return [] as InboxItem[];
        }
        const perLecture = await Promise.all(
          lectures.map(async (lec) => {
            try {
              const { data } = await api.get<DashboardQaResponse>(
                `/api/v1/dashboard/${lec.id}/qa?limit=200`,
                { timeout: 12000 },
              );
              return (data?.logs ?? []).map((log) =>
                fromDashboardLog(log, lec, course),
              );
            } catch {
              return [] as InboxItem[];
            }
          }),
        );
        return perLecture.flat();
      }),
    );
    return perCourse.flat();
  } catch {
    return null;
  }
}

// ── Public client ───────────────────────────────────────────────────────────

export type InboxApiOptions = MockResolveOptions;

export const inboxApi = {
  /**
   * 1차: `/api/v1/inbox` (도착 시 채택)
   * 2차: dashboard fan-out
   * 3차: mock seed
   */
  async list(opts: InboxApiOptions = {}): Promise<InboxListResult> {
    // 1) 직접 인박스 엔드포인트 시도
    try {
      const { data } = await api.get<InboxListResult>("/api/v1/inbox");
      if (data && Array.isArray(data.items)) {
        return {
          items: applyOverrides(data.items),
          stats: data.stats ?? {
            ...summarise(data.items),
            avgResponseHours: undefined,
          },
          deferred: false,
        };
      }
    } catch (err) {
      // 404/501 은 정상 — 다음 단계로 진행
      const status = (err as AxiosError | undefined)?.response?.status;
      if (status && status !== 404 && status !== 501) {
        // 5xx 등 진짜 장애는 mock 전에 한 번 더 fan-out 시도
      }
    }

    // 2) Dashboard 기반 fan-out
    const fanout = await listFromDashboardFanout();
    if (fanout && fanout.length > 0) {
      const items = applyOverrides(fanout);
      return {
        items,
        stats: { ...summarise(items), avgResponseHours: undefined },
        deferred: false,
      };
    }

    // 3) Mock fallback
    return buildMockResult(opts);
  },

  /**
   * 단건 답변 확정. 실패 시 sessionStorage 에 override 보관 (deferred=true).
   */
  async answer(
    id: string,
    payload: InboxAnswerPayload,
  ): Promise<InboxAnswerResult> {
    try {
      await api.patch(`/api/v1/inbox/${id}/answer`, payload);
      return { ok: true, deferred: false };
    } catch {
      const store = readStore();
      const reviewedAt = new Date().toISOString();
      store[id] = {
        ...store[id],
        professorAnswer: payload.body,
        professorAnswered: payload.mode === "send",
        responded: store[id]?.responded ?? payload.mode === "send",
        reviewedAt,
      };
      writeStore(store);
      return { ok: true, deferred: true };
    }
  },

  /**
   * 일괄 RAG 초안 확정. 실패 시 모든 항목을 deferred 로 처리.
   */
  async bulkConfirm(
    payload: InboxBulkConfirmPayload,
  ): Promise<InboxBulkConfirmResult> {
    try {
      const { data } = await api.post<InboxBulkConfirmResult>(
        "/api/v1/inbox/bulk-confirm",
        payload,
      );
      if (data && Array.isArray(data.successIds)) {
        return { ...data, deferred: false };
      }
      throw new Error("malformed response");
    } catch {
      const store = readStore();
      const reviewedAt = new Date().toISOString();
      for (const id of payload.ids) {
        store[id] = {
          ...store[id],
          professorAnswered: true,
          responded: true,
          reviewedAt,
        };
      }
      writeStore(store);
      return {
        successIds: [...payload.ids],
        failedIds: [],
        deferred: true,
      };
    }
  },

  /**
   * 종합 리포트 다운로드 — `/api/v1/qa/export?format=csv[&course_id=...]`.
   *
   * 백엔드가 도달하면 CSV blob 을 그대로 받아 브라우저 다운로드 트리거.
   * `lecture_id` 단위 다운로드도 지원하지만 현재 UI 는 강의(course) 단위와
   * 전체만 노출합니다. SSR / 테스트 환경 (window 없음) 에서는 no-op.
   */
  async downloadReport(scope: InboxReportScope): Promise<void> {
    const params = new URLSearchParams({ format: "csv" });
    if (scope !== "all") {
      params.set("course_id", scope.courseId);
    }
    const { data } = await api.get<Blob>(`/api/v1/qa/export?${params.toString()}`, {
      responseType: "blob",
    });
    if (typeof window === "undefined") return;
    const blob =
      data instanceof Blob
        ? data
        : new Blob([data as unknown as BlobPart], {
            type: "text/csv;charset=utf-8",
          });
    const url = window.URL.createObjectURL(blob);
    const a = window.document.createElement("a");
    a.href = url;
    a.download =
      scope === "all"
        ? "qa_report_all.csv"
        : `qa_report_course_${scope.courseId}.csv`;
    window.document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  /** 테스트 / 개발용 — 로컬 override 초기화. */
  _clearLocalOverrides(): void {
    memoryStore = {};
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem(STORE_KEY);
      } catch {
        /* ignore */
      }
    }
  },
};
