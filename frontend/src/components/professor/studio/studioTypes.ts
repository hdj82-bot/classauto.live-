/**
 * Studio 마법사 타입 정의.
 *
 * 백엔드 응답 shape 와 1:1 대응되는 타입은 여기에서만 정의해서
 * Step 컴포넌트들이 같은 모양을 공유하도록 한다.
 */

export type StudioStep = 1 | 2 | 3 | 4 | 5;

export const STEP_NAMES: Record<StudioStep, string> = {
  1: "upload",
  2: "scriptReview",
  3: "avatarVoice",
  4: "render",
  5: "share",
};

// ── 강좌 / 강의 ──────────────────────────────────────────────────────────────

export interface Course {
  id: string;
  title: string;
}

export type VoiceGender = "male" | "female";

// 음성·자막 지원 언어 (ISO 639-1). 백엔드 schemas/lecture.py VoiceLang 와 1:1.
export type LangCode = "ko" | "zh" | "en" | "ja" | "de" | "fr" | "ru";

export const LANGUAGES: { code: LangCode; label: string }[] = [
  { code: "ko", label: "한국어" },
  { code: "zh", label: "중국어" },
  { code: "en", label: "영어" },
  { code: "ja", label: "일본어" },
  { code: "de", label: "독일어" },
  { code: "fr", label: "프랑스어" },
  { code: "ru", label: "러시아어" },
];

// 스튜디오 음성·자막 셀렉터에 노출하는 언어 — 일단 4개만 (교수자 결정 2026-06-12).
// 백엔드 regenerate_script_language 의 _VOICE_LANGS 와 1:1 로 맞춘다.
export const STUDIO_LANG_CODES: LangCode[] = ["ko", "en", "zh", "ja"];

export const STUDIO_LANGUAGES: { code: LangCode; label: string }[] =
  LANGUAGES.filter((l) => STUDIO_LANG_CODES.includes(l.code));

export function langLabel(code: string | null | undefined): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? "한국어";
}

export interface Lecture {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  slug: string;
  is_published: boolean;
  video_url: string | null;
  pipeline_task_id?: string | null;
  expires_at: string | null;
  voice_gender: VoiceGender;
  // 영상 음성(TTS) 언어. 기본 "ko".
  voice_lang?: LangCode;
  // 영상 자막 언어. null = 음성과 동일(별도 번역 없음).
  subtitle_lang?: LangCode | null;
  // 선택한 ElevenLabs 보이스 ID. null = 성별 기준 기본 보이스.
  voice_id?: string | null;
  // 발화 속도 배율. 1.0 = 기본. 합성 시 0.7~1.2 로 클램프.
  voice_speed?: number;
}

// ── 스크립트 ─────────────────────────────────────────────────────────────────

export type ToneTag = "normal" | "emphasis" | "soft" | "fast";

export interface ScriptSegment {
  slide_index: number;
  text: string;
  start_seconds: number;
  end_seconds: number;
  tone: ToneTag;
  question_pin_seconds: number | null;
}

export interface SubtitleSegment {
  slide_index: number;
  text: string;
}

export interface ScriptResponse {
  video_id: string;
  status: string;
  segments: ScriptSegment[];
  ai_segments: ScriptSegment[] | null;
  // 자막 세그먼트. null = 아직 번역 안 함(자막 = 발화 내용과 동일).
  subtitle_segments?: SubtitleSegment[] | null;
  approved_at: string | null;
}

// ── 슬라이드 메타 (편집기 즉시 렌더용) ───────────────────────────────────────
//
// GET /api/lectures/{lecture_id}/slides 응답. 백엔드 schemas/lecture.py
// SlideMeta · SlidesResponse 와 1:1.
//
// status:
//   - "pending": PPTX 파싱·임베딩까지 끝났지만 AI 다듬은 스크립트가 아직 없음.
//                좌측 카드는 즉시 노출하고, 중앙 미리보기·script 영역만 skeleton
//                + "AI 생성 중…" 인디케이터로 표시한다.
//   - "ready":   해당 인덱스의 ScriptSegment 가 도착함 — 정상 렌더.

export type SlideMetaStatus = "pending" | "ready";

export interface SlideMeta {
  index: number;
  title: string | null;
  status: SlideMetaStatus;
  /**
   * 백엔드 ``SlideMeta.image_url`` 과 1:1 (snake_case 유지 — wire shape).
   * PPTX → PNG 렌더 결과의 S3 https URL. 렌더 인프라가 아직 배포되지 않았거나
   * 컬럼이 없는 환경에서는 항상 null — 프론트는 DefaultSlideMock 으로 fallback.
   */
  image_url: string | null;
}

export interface SlidesResponse {
  lecture_id: string;
  slides: SlideMeta[];
}

// 슬라이드별 검토 상태 — Step2 의 인라인 diff 채택/거부 흐름.
// "pending" 은 아직 어떤 액션도 하지 않은 상태, "edited" 는 채택했는지와 무관하게
// 직접 편집한 상태. 보강 필요(warning) 는 AI 가 정보 부족으로 표시.
export type SlideReviewStatus = "pending" | "accepted" | "rejected" | "edited" | "warning";

// ── 아바타 / 음성 ─────────────────────────────────────────────────────────────

export interface HeyGenAvatar {
  id: string;
  name: string;
  preview_image_url?: string | null;
  preview_video_url?: string | null;
  gender?: string | null;
}

export type TtsProvider = "elevenlabs" | "google";

// GET /api/voices 의 보이스 1개. 백엔드 schemas/voice.py TtsVoice 와 1:1.
export interface TtsVoice {
  voice_id: string;
  name: string;
  gender?: string | null;
  accent?: string | null;
  description?: string | null;
  preview_url?: string | null;
  category?: string | null;
  // 한국어 표기.
  display_name?: string;
  description_ko?: string | null;
  gender_ko?: string | null;
  accent_ko?: string | null;
  /** 현재 교수자가 즐겨찾기한 보이스인지 (GET /api/voices). */
  is_favorite?: boolean;
}

// ── 비용 ─────────────────────────────────────────────────────────────────────

export interface CostBreakdown {
  ttsChars: number;
  ttsCost: number; // USD
  avatarSeconds: number;
  avatarCost: number; // USD
  total: number;     // USD
}

export interface PlanUsage {
  used: number;       // 이번 달 이미 사용한 금액 (USD)
  limit: number;      // 이번 달 한도 (USD). 0 = 무제한 (Pro)
  monthlyVideoCount?: number;
  monthlyVideoLimit?: number;
}

// ── 렌더 진행 ───────────────────────────────────────────────────────────────

export type RenderPhase = 1 | 2 | 3 | 4;

export interface RenderItem {
  id: string;
  slide_number: number | null;
  status: "pending" | "queued" | "rendering" | "ready" | "failed" | string;
  s3_video_url: string | null;
  error_message: string | null;
  created_at: string | null;
  completed_at: string | null;
}

export interface RenderStatus {
  lecture_id: string;
  total: number;
  completed: number;
  failed: number;
  renders: RenderItem[];
}

// ── 인터랙티브 퀴즈 (소크라테스식 저작) ───────────────────────────────────────
//
// 강의 영상 중간(슬라이드 N↔N+1 사이)에 삽입할 퀴즈를 클로드와 다중 턴 대화로
// 확정한다. 백엔드 schemas/quiz.py 와 1:1. 난이도는 상=hard / 중=medium / 하=easy.

export type QuizQuestionType = "multiple_choice" | "short_answer";
export type QuizDifficulty = "easy" | "medium" | "hard";

export const QUIZ_DIFFICULTY_LABEL: Record<QuizDifficulty, string> = {
  hard: "상",
  medium: "중",
  easy: "하",
};

export const QUIZ_TYPE_LABEL: Record<QuizQuestionType, string> = {
  multiple_choice: "객관식",
  short_answer: "주관식",
};

/** 대화 중 클로드가 제시하는 현재 최선 문제 초안 (확정 전). */
export interface QuizDraft {
  question_type: QuizQuestionType;
  difficulty: QuizDifficulty;
  content: string;
  options: string[] | null;
  correct_answer: string | null;
  explanation: string | null;
}

/** 화면에 보이는 대화 1턴. user = 교수자, assistant = 클로드. */
export interface SocraticMessage {
  role: "user" | "assistant";
  content: string;
}

/** 우측 패널의 삽입 지점 1개 (설정 + 저작 결과). */
export interface QuizInsertionPoint {
  /** 슬라이드 N↔N+1 사이의 0-based N. */
  boundaryIndex: number;
  questionType: QuizQuestionType;
  difficulty: QuizDifficulty;
  /** 학생이 영상에서 푼 직후 정답·해설을 공개할지. false = 비공개(대면 활용). */
  revealAnswer: boolean;
  /** 저장된 문제 id. null = 아직 미작성. */
  authoredId: string | null;
  /** 저장된 문제 내용(다시 보기·수정용). authoredId 가 있을 때만 채워짐. */
  savedDraft?: QuizDraft | null;
}

/** GET /api/lectures/{id}/quiz 의 항목 (교수자 — 정답·해설 포함). */
export interface AuthoredQuiz {
  id: string;
  insert_after_slide_index: number | null;
  question_type: QuizQuestionType;
  difficulty: QuizDifficulty;
  content: string;
  options: string[] | null;
  correct_answer: string | null;
  explanation: string | null;
  timestamp_seconds: number | null;
  reveal_answer: boolean;
}
