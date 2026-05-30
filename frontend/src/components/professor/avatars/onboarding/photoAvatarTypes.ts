/**
 * 교수자 본인 아바타 온보딩 (Photo Avatar + Design with AI 룩) 타입 정의.
 *
 * 근거: docs/planning/12-self-avatar-onboarding.md §7 API 엔드포인트.
 *
 * 백엔드 계약 (창 = backend, 미머지 가능):
 *  - POST /api/avatars/me/photo-avatar  (multipart file)  → { group_id, status }
 *  - GET  /api/avatars/me/photo-avatar                    → { group_id, status }
 *  - POST /api/avatars/me/looks  ({ prompt, count≤4 })    → { generation_id }
 *  - GET  /api/avatars/me/looks                           → LookWire[]
 *  - POST /api/avatars/me/looks/{look_id}/select          → { ok }
 *  - (재사용) GET/POST /api/avatars/me/preview            → 움직이는 미리보기
 *  - (재사용) GET/POST /api/avatars/me/voice              → 본인 음성 클론
 *
 * wire shape 는 snake_case. 도메인 타입도 계약을 그대로 따르되, "아직 그룹
 * 없음"을 표현하기 위해 그룹 상태에 ``none`` 을 추가한다(백엔드는 404 또는
 * 빈 응답으로 표현 → 경계에서 none 으로 정규화).
 */

/** 그룹 학습 상태. 계약은 training|ready|failed, none 은 "미시작" 표현용. */
export type PhotoAvatarGroupStatus = "none" | "training" | "ready" | "failed";

/** 학습 실패 사유 분류 코드. status="failed" 일 때만 의미. */
export type PhotoAvatarErrorCode = "insufficient_credit" | "invalid_image" | "unknown";

export interface PhotoAvatarGroup {
  group_id: string | null;
  status: PhotoAvatarGroupStatus;
  /** status="failed" 일 때의 사유 코드(정확한 안내 선택용). 없으면 null. */
  errorCode?: PhotoAvatarErrorCode | null;
}

/** Design with AI 룩 1개. status 가 ready 일 때만 갤러리/선택 대상. */
export type LookStatus = "generating" | "ready" | "failed";

export interface Look {
  look_id: string;
  preview_image_url: string | null;
  prompt: string | null;
  status: LookStatus;
}

/** POST /api/avatars/me/looks 응답 — 배치 생성 작업 식별자. */
export interface LookGeneration {
  generation_id: string;
}

/** 온보딩 단계 (스테퍼). 5단계 = 기획 §4 흐름. */
export type OnboardingStep =
  | "upload" // ① 사진 업로드
  | "training" // ② 본인 아바타 준비 중 (그룹 학습 폴링)
  | "generate" // ③ 프롬프트 + 룩 배치 생성
  | "select" // ④ 룩 갤러리에서 기본 룩 선택
  | "preview"; // ⑤ 본인 목소리로 움직이는 미리보기 → 확정

export const ONBOARDING_STEPS: OnboardingStep[] = [
  "upload",
  "training",
  "generate",
  "select",
  "preview",
];

/** 룩 배치 1회 상한 (계약: count ≤ 4). docs §8 비용 가드레일. */
export const LOOK_BATCH_MAX = 4;

/**
 * 교수자당 누적 룩 상한(클라이언트 가드레일). docs §8 의
 * ``PHOTO_AVATAR_LOOK_TOTAL_MAX`` 대응 — 무심코 다량 생성 방지. 백엔드가
 * 권위 있는 상한을 강제하더라도, UI 도 "추가 생성"을 여기서 막는다.
 */
export const LOOK_TOTAL_MAX = 12;
