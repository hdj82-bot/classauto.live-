import { api } from "@/lib/api";

/**
 * 교수자 Q&A 사전 질문(seed questions) API 래퍼.
 *
 * 백엔드 app/api/v1/lectures.py 의 GET/PUT /api/lectures/{id}/seed-questions 와 1:1.
 * 교수자가 "학생이 자주 물을 법한 질문"을 강의당 최대 3개까지 등록해 두면, 영상
 * 생성(approve) 시 그 질문에 대한 답변을 **강의 자료 기반 RAG 로 자동 생성**해
 * 아바타 클립으로 미리 렌더한다. 첫 영상처럼 학생 질문 축적이 없을 때도, 학생이
 * 비슷한 질문을 하면 첫 질문부터 아바타 답변이 바로 이어진다.
 *
 * → 교수자는 **질문만** 입력한다(답변은 시스템이 생성). 답변을 직접 적지 않는다.
 *
 * 계약 (LOCKED):
 * - GET  /api/lectures/{id}/seed-questions
 *     → { questions: SeedQuestion[], max, used_this_month, remaining }
 * - PUT  /api/lectures/{id}/seed-questions
 *     body { questions: string[] }   (전량 교체 = replace-all, 최대 3)
 *     → 위와 동일 shape (서버가 id·status 부여)
 *
 * 퀴즈 저작과 달리 개별 항목 POST/DELETE 가 없다 — 패널의 현재 질문 목록 전체를
 * PUT 으로 통째 저장하는 단일 자원이다. getSeedQuestions 는 백엔드 미배포/404 시
 * quizApi 와 동일하게 빈 목록으로 degrade 한다.
 */

/** 렌더 상태 — 사전 질문 클립의 진행 상태. */
export type SeedQuestionStatus = "pending" | "rendering" | "ready" | "failed";

/** 서버가 내려주는 사전 질문 1건. */
export interface SeedQuestion {
  id: string;
  question: string;
  status: SeedQuestionStatus;
  /** 재생 가능한 아바타 클립 보유 여부. */
  has_clip: boolean;
}

/**
 * 우측 패널이 편집하는 working copy 1개. 아직 저장 전(새로 추가)이면 id=null·
 * status 없음. 저장된 항목은 서버가 부여한 id·status 를 함께 보관한다.
 * (교수자는 question 만 편집한다 — 답변은 서버가 RAG 로 생성.)
 */
export interface SeedQuestionDraft {
  id: string | null;
  question: string;
  status?: SeedQuestionStatus;
  has_clip?: boolean;
}

interface SeedQuestionsWire {
  questions: SeedQuestion[];
  max: number;
  used_this_month: number;
  remaining: number;
}

export interface SeedQuestionsResult {
  seedQuestions: SeedQuestion[];
  /** 영상당 등록 가능한 최대 개수(= 영상당 렌더 한도). */
  max: number;
  /** 이번 달 사용한 교수자 Q&A 렌더 수. */
  usedThisMonth: number;
  /** 이번 달 남은 렌더 슬롯 수. */
  remaining: number;
  /** 백엔드 미응답/404 로 빈 목록을 쓰는 중인지. */
  deferred: boolean;
}

function _parse(data: SeedQuestionsWire, deferred: boolean): SeedQuestionsResult {
  return {
    seedQuestions: data.questions ?? [],
    max: data.max ?? 3,
    usedThisMonth: data.used_this_month ?? 0,
    remaining: data.remaining ?? 0,
    deferred,
  };
}

export async function getSeedQuestions(
  lectureId: string,
): Promise<SeedQuestionsResult> {
  try {
    const { data } = await api.get<SeedQuestionsWire>(
      `/api/lectures/${lectureId}/seed-questions`,
    );
    return _parse(data, false);
  } catch {
    return {
      seedQuestions: [],
      max: 3,
      usedThisMonth: 0,
      remaining: 0,
      deferred: true,
    };
  }
}

export async function putSeedQuestions(
  lectureId: string,
  questions: string[],
): Promise<SeedQuestionsResult> {
  const { data } = await api.put<SeedQuestionsWire>(
    `/api/lectures/${lectureId}/seed-questions`,
    { questions },
  );
  return _parse(data, false);
}
