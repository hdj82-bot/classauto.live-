import { api } from "@/lib/api";

/**
 * 교수자 Q&A 사전 답변(seed questions) API 래퍼.
 *
 * 백엔드 app/api/v1/lectures.py 의 GET/PUT /api/lectures/{id}/seed-questions 와 1:1.
 * 교수자가 "학생이 자주 물을 법한 질문 + (선택) 사전 대답"을 강의당 최대 3개까지
 * 등록해 둔다. 영상 생성(approve) 시 각 항목을 아바타 클립으로 미리 렌더해, 학생이
 * 비슷한 질문을 하면 첫 질문부터 아바타가 바로 답한다.
 *
 * 하이브리드: **사전 대답을 적으면 그 답변으로** 렌더하고, **비우면 강의 자료 기반
 * RAG 로 자동 생성**한다. ready 가 되면 preview_url 로 점검(미리보기 재생) 가능.
 *
 * 계약 (LOCKED):
 * - GET  /api/lectures/{id}/seed-questions
 *     → { questions: SeedQuestion[], max, used_this_month, remaining }
 * - PUT  /api/lectures/{id}/seed-questions
 *     body { questions: [{ question, answer }] }   (전량 교체 = replace-all, 최대 3)
 *     → 위와 동일 shape (서버가 id·status·preview_url 부여)
 *
 * 퀴즈 저작과 달리 개별 항목 POST/DELETE 가 없다 — 패널의 현재 목록 전체를 PUT 으로
 * 통째 저장하는 단일 자원이다. getSeedQuestions 는 백엔드 미배포/404 시 quizApi 와
 * 동일하게 빈 목록으로 degrade 한다.
 */

/** 렌더 상태 — 사전 질문 클립의 진행 상태. */
export type SeedQuestionStatus = "pending" | "rendering" | "ready" | "failed";

/** 서버가 내려주는 사전 질문 1건. */
export interface SeedQuestion {
  id: string;
  question: string;
  /** 교수자가 입력한 사전 대답(비어 있으면 영상 생성 시 RAG 자동 생성). */
  answer: string;
  status: SeedQuestionStatus;
  /** 재생 가능한 아바타 클립 보유 여부. */
  has_clip: boolean;
  /** ready 인 경우 점검용 클립 presigned URL(아니면 null). */
  preview_url: string | null;
}

/** PUT 으로 보낼 항목 — 질문 + (선택) 사전 대답. */
export interface SeedQuestionInput {
  question: string;
  answer: string;
}

/**
 * 우측 패널이 편집하는 working copy 1개. 아직 저장 전(새로 추가)이면 id=null·
 * status 없음. 저장된 항목은 서버가 부여한 id·status·preview_url 을 함께 보관한다.
 */
export interface SeedQuestionDraft {
  id: string | null;
  question: string;
  answer: string;
  status?: SeedQuestionStatus;
  has_clip?: boolean;
  preview_url?: string | null;
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
  questions: SeedQuestionInput[],
): Promise<SeedQuestionsResult> {
  const { data } = await api.put<SeedQuestionsWire>(
    `/api/lectures/${lectureId}/seed-questions`,
    { questions },
  );
  return _parse(data, false);
}
