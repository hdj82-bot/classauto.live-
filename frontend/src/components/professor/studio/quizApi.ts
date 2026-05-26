import { api } from "@/lib/api";
import type {
  AuthoredQuiz,
  QuizDifficulty,
  QuizDraft,
  QuizQuestionType,
  SocraticMessage,
} from "./studioTypes";

/**
 * 인터랙티브 퀴즈 저작 API 래퍼.
 *
 * 백엔드 app/api/v1/quiz.py 와 1:1.
 * - socraticTurn: 대화 1턴 (Sonnet). messages 가 비면 첫 턴(클로드가 먼저 제안).
 *   프론트는 화면에 보이는 턴만 보관하고, 숨은 kickoff 는 백엔드가 항상 선행시킨다.
 * - confirmQuiz: 확정 문제를 슬라이드 경계 anchor 로 저장(경계당 1문항, 재작성 시 교체).
 * - listAuthoredQuizzes: 패널 재수화. 백엔드 미배포/404 시 빈 목록으로 degrade.
 * - deleteQuiz: 재작성/제거용.
 */

interface SocraticTurnWire {
  reply: string;
  draft: QuizDraft | null;
  done: boolean;
}

export interface SocraticTurnResult {
  reply: string;
  draft: QuizDraft | null;
  done: boolean;
}

export async function socraticTurn(
  lectureId: string,
  params: {
    insertAfterSlideIndex: number;
    questionType: QuizQuestionType;
    difficulty: QuizDifficulty;
    messages: SocraticMessage[];
  },
): Promise<SocraticTurnResult> {
  const { data } = await api.post<SocraticTurnWire>(
    `/api/lectures/${lectureId}/quiz/socratic`,
    {
      insert_after_slide_index: params.insertAfterSlideIndex,
      question_type: params.questionType,
      difficulty: params.difficulty,
      messages: params.messages,
    },
  );
  return { reply: data.reply, draft: data.draft ?? null, done: !!data.done };
}

export interface ConfirmQuizResult {
  id: string;
  insert_after_slide_index: number;
  timestamp_seconds: number | null;
}

export async function confirmQuiz(
  lectureId: string,
  insertAfterSlideIndex: number,
  draft: QuizDraft,
  revealAnswer: boolean,
): Promise<ConfirmQuizResult> {
  const { data } = await api.post<ConfirmQuizResult>(
    `/api/lectures/${lectureId}/quiz/confirm`,
    {
      insert_after_slide_index: insertAfterSlideIndex,
      question_type: draft.question_type,
      difficulty: draft.difficulty,
      content: draft.content,
      options: draft.options,
      correct_answer: draft.correct_answer,
      explanation: draft.explanation,
      reveal_answer: revealAnswer,
    },
  );
  return data;
}

interface AuthoredListWire {
  lecture_id: string;
  quizzes: AuthoredQuiz[];
}

export interface AuthoredQuizListResult {
  quizzes: AuthoredQuiz[];
  /** 백엔드 미응답/404 로 빈 목록을 쓰는 중인지. */
  deferred: boolean;
}

export async function listAuthoredQuizzes(
  lectureId: string,
): Promise<AuthoredQuizListResult> {
  try {
    const { data } = await api.get<AuthoredListWire>(
      `/api/lectures/${lectureId}/quiz`,
    );
    return { quizzes: data.quizzes ?? [], deferred: false };
  } catch {
    return { quizzes: [], deferred: true };
  }
}

export async function deleteQuiz(
  lectureId: string,
  questionId: string,
): Promise<void> {
  await api.delete(`/api/lectures/${lectureId}/quiz/${questionId}`);
}
