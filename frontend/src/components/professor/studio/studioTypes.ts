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

export interface ScriptResponse {
  video_id: string;
  status: string;
  segments: ScriptSegment[];
  ai_segments: ScriptSegment[] | null;
  approved_at: string | null;
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
