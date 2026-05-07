/**
 * Studio 마법사 가드레일 검증 — 순수 함수만.
 *
 * 백엔드의 검증을 1:1 미러링해서 사용자가 백엔드 라운드트립을 거치지 않고
 * 즉시 차단을 볼 수 있게 한다. 백엔드는 여전히 권위 있는 검증자이므로
 * 여기서 통과해도 백엔드가 거부할 수 있고, 그 응답은 호출자가 처리한다.
 *
 * docs/planning/02-guardrails.md 의 1차 가드레일(입력 제약)이 적용된다.
 * Q&A 측 가드레일(2~4차)은 학생 측이라 본 모듈 범위 밖.
 */

import type { CostBreakdown, PlanUsage } from "./studioTypes";

// ── 1차: PPT 업로드 입력 제약 ────────────────────────────────────────────────

// backend/app/api/v1/render.py 의 MAX_UPLOAD_SIZE 와 동일.
export const MAX_PPT_BYTES = 100 * 1024 * 1024;

// ".pptx" 만 허용. ".ppt" 는 백엔드가 거부하므로 프론트에서도 미리 차단.
export const ALLOWED_PPT_EXTENSION = ".pptx";

export type PptValidationResult =
  | { ok: true }
  | { ok: false; reason: "type" | "size"; sizeMB?: number };

export function validatePptFile(file: File | null): PptValidationResult {
  if (!file) return { ok: false, reason: "type" };

  const lower = file.name.toLowerCase();
  if (!lower.endsWith(ALLOWED_PPT_EXTENSION)) {
    return { ok: false, reason: "type" };
  }

  if (file.size > MAX_PPT_BYTES) {
    return {
      ok: false,
      reason: "size",
      sizeMB: Math.round((file.size / (1024 * 1024)) * 10) / 10,
    };
  }

  return { ok: true };
}

// ── 비용·플랜 한도 ─────────────────────────────────────────────────────────

// 80% 도달 시 cost-meter 가 펄스 경고. 100% 초과 시 영상 생성 차단.
export const COST_WARNING_THRESHOLD = 0.8;

export interface CostGuardrailDecision {
  // 한도 대비 사용 비율 (0 ~ Infinity). limit=0 (무제한) 인 경우 0 반환.
  ratio: number;
  // 80% 이상 도달
  warn: boolean;
  // 100% 초과 — 영상 생성 차단
  block: boolean;
  // 진행 시 추가될 예상 비용까지 합산한 비율 (있을 경우)
  ratioWithEstimate?: number;
}

export function evaluatePlanUsage(
  usage: PlanUsage,
  estimate?: CostBreakdown,
): CostGuardrailDecision {
  // limit=0 → 무제한 (Pro). 항상 통과.
  if (!usage.limit || usage.limit <= 0) {
    return { ratio: 0, warn: false, block: false };
  }

  const ratio = usage.used / usage.limit;
  const ratioWithEstimate = estimate
    ? (usage.used + estimate.total) / usage.limit
    : ratio;

  // 이미 한도를 넘었거나 이번 영상 생성 후 넘게 될 것 같으면 block.
  const block = ratio >= 1 || ratioWithEstimate > 1;
  // 80% 도달 시 warn.
  const warn = ratio >= COST_WARNING_THRESHOLD || ratioWithEstimate >= COST_WARNING_THRESHOLD;

  return { ratio, warn, block, ratioWithEstimate };
}

// ── 강의 생성 폼 검증 ────────────────────────────────────────────────────────

export type StudioFormError =
  | "title"
  | "course"
  | "ppt"
  | "pptType"
  | "pptSize";

export interface StudioFormState {
  title: string;
  courseMode: "existing" | "new";
  selectedCourseId: string;
  newCourseTitle: string;
  file: File | null;
}

// Step1 폼이 다음 단계로 진행 가능한 상태인지 검증. 첫 번째로 발견한
// 에러를 반환 — 다국어 메시지는 호출 측에서 i18n 으로 매핑한다.
export function validateStep1(state: StudioFormState): StudioFormError | null {
  if (!state.title.trim()) return "title";

  if (state.courseMode === "existing" && !state.selectedCourseId) {
    return "course";
  }
  if (state.courseMode === "new" && !state.newCourseTitle.trim()) {
    return "course";
  }

  const ppt = validatePptFile(state.file);
  if (!ppt.ok) {
    return ppt.reason === "size" ? "pptSize" : "pptType";
  }

  return null;
}
