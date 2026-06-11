import { api } from "@/lib/api";

/**
 * 학생 영상 재생 중 인터랙티브 퀴즈 API (PlayerV2 전용).
 *
 * 백엔드 app/api/v1/quiz.py 의 학생 엔드포인트와 1:1.
 * - getPlaybackQuizzes: 타임스탬프 순 퀴즈 목록(정답·해설 미포함). 404/미배포 → [].
 * - submitInterstitialAnswer: 응답 기록·채점. reveal_answer=false 면 정/오답·정답을
 *   모두 숨긴 채(완전 비공개) recorded 만 true 로 돌아온다.
 */

export interface PlaybackQuiz {
  id: string;
  question_type: "multiple_choice" | "short_answer";
  difficulty: "easy" | "medium" | "hard";
  content: string;
  options: string[] | null;
  timestamp_seconds: number | null;
  insert_after_slide_index: number | null;
  reveal_answer: boolean;
}

interface PlaybackListWire {
  lecture_id: string;
  quizzes: PlaybackQuiz[];
}

export async function getPlaybackQuizzes(
  lectureId: string,
  preview = false,
): Promise<PlaybackQuiz[]> {
  try {
    // 미리보기(소유 교수자)는 학생 세션이 없으므로 owner 전용 preview 엔드포인트로,
    // 일반 학생 시청은 학생 전용 엔드포인트로 받는다(둘 다 정답·해설 미포함).
    const path = preview
      ? `/api/lectures/${lectureId}/quiz/playback/preview`
      : `/api/lectures/${lectureId}/quiz/playback`;
    const { data } = await api.get<PlaybackListWire>(path);
    return (data.quizzes ?? []).filter((q) => q.timestamp_seconds != null);
  } catch {
    // 미배포/404/권한 — 퀴즈 없이 재생.
    return [];
  }
}

export interface InterstitialAnswerResult {
  recorded: boolean;
  reveal: boolean;
  timestamp_valid: boolean;
  /** reveal=true 일 때만. 객관식 correct_answer 는 정답 인덱스 "0"~"3". */
  is_correct: boolean | null;
  correct_answer: string | null;
  explanation: string | null;
}

export async function submitInterstitialAnswer(
  lectureId: string,
  params: {
    sessionId: string;
    questionId: string;
    userAnswer: string;
    videoTimestampSeconds: number;
  },
): Promise<InterstitialAnswerResult> {
  const { data } = await api.post<InterstitialAnswerResult>(
    `/api/lectures/${lectureId}/quiz/answer`,
    {
      session_id: params.sessionId,
      question_id: params.questionId,
      user_answer: params.userAnswer,
      video_timestamp_seconds: params.videoTimestampSeconds,
    },
  );
  return data;
}
