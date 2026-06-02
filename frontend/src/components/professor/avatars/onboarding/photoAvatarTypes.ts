/**
 * 교수자 본인 아바타 온보딩 (Photo Avatar + Design with AI 룩) 타입 정의.
 *
 * 근거: docs/planning/12-self-avatar-onboarding.md §7 API 엔드포인트.
 *
 * 백엔드 계약 (창 = backend, 미머지 가능):
 *  - POST /api/avatars/me/photo-avatar  (multipart file)  → { group_id, status }
 *  - GET  /api/avatars/me/photo-avatar                    → { group_id, status }
 *  - POST /api/avatars/me/looks  ({ persona, outfit?, background?,
 *      expression?, extra?, count≤4 })                    → { generation_id }
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

/** gpt 룩 1개. status 가 ready 일 때만 갤러리/선택 대상. */
export type LookStatus = "generating" | "ready" | "failed";

export interface Look {
  look_id: string;
  /** v0.2 gpt 룩 이미지의 S3 URL(계약 LookItem.image_url). 우선 표시. */
  image_url: string | null;
  /** 레거시 썸네일(presigned). image_url 부재 시 폴백. */
  preview_image_url: string | null;
  prompt: string | null;
  status: LookStatus;
  /** 라이브러리에 저장(확정)된 룩이면 true. 후보(미저장)는 false. */
  saved: boolean;
}

/** POST /api/avatars/me/looks 응답 — 배치 생성 작업 식별자. */
export interface LookGeneration {
  generation_id: string;
}

// ── v0.2 구조화 룩 옵션 (계약 schemas/avatar.py 의 enum 과 1:1) ─────────────────
// 백엔드(openai_image.build_prompt)가 이 키를 영어 프롬프트로 매핑하므로 값은
// 계약 리터럴과 정확히 일치해야 한다(번역·자유문 금지).

/** 교수자 페르소나(필수). */
export type PersonaKey = "educator" | "researcher" | "mentor" | "podcast_host";
/** 복장(선택, null=자동 추론). */
export type OutfitKey = "suit" | "blazer" | "shirt" | "knit" | "tee" | "hoodie";
/** 배경(선택, null=자동). */
export type BackgroundKey =
  | "lecture"
  | "lab"
  | "study"
  | "studio"
  | "lounge"
  | "cafe";
/** 표정(선택, null=자동). */
export type ExpressionKey =
  | "neutral"
  | "friendly"
  | "warm"
  | "confident"
  | "thoughtful";

/** 소품(선택, null=없음). v0.3 — HeyGen 갤러리 류 다양성. */
export type PropKey = "mic_stand";

/** 손·팔 자세(선택, null=자동). v0.3. holding_mic 은 핸드헬드 마이크를 함께 강제. */
export type PoseKey =
  | "crossed_arms"
  | "gesturing"
  | "holding_mic"
  | "relaxed_at_sides";

/** 룩 배치 생성 입력 — LookGenerateRequest(persona 필수, 나머지 선택)에 대응. */
export interface LookGenerateInput {
  persona: PersonaKey;
  outfit?: OutfitKey | null;
  background?: BackgroundKey | null;
  expression?: ExpressionKey | null;
  /** 소품(v0.3). null=없음. */
  prop?: PropKey | null;
  /** 손·팔 자세(v0.3). null=자동. */
  pose?: PoseKey | null;
  /** 추가 자유 묘사(≤500). */
  extra?: string | null;
}

/** 온보딩 단계 (스테퍼). v0.2 = train 제거 1단계 압축(docs §0.3). */
export type OnboardingStep =
  | "upload" // ① 사진 업로드 (provider=gpt 는 즉시 ready)
  | "generate" // ② 구조화 옵션 + 룩 배치 생성
  | "select" // ③ 룩 갤러리에서 기본 룩 선택
  | "preview"; // ④ 본인 목소리로 움직이는 미리보기 → 확정

export const ONBOARDING_STEPS: OnboardingStep[] = [
  "upload",
  "generate",
  "select",
  "preview",
];

/** 룩 배치 1회 상한 (계약: count ≤ PHOTO_AVATAR_LOOK_BATCH_MAX=4). */
export const LOOK_BATCH_MAX = 4;

/** 한 배치 기본 생성 수 (계약 PHOTO_AVATAR_LOOK_BATCH_DEFAULT=3). */
export const LOOK_BATCH_DEFAULT = 3;

/**
 * 온보딩에서 만들 수 있는 룩 후보(non-failed)의 누적 상한(클라이언트 가드레일).
 * 계약 ``PHOTO_AVATAR_LOOK_TOTAL_MAX``(기본 20)에 정렬. 도달 시 생성 버튼은
 * 사라지지 않고 비활성 + 안내 문구만 노출한다(삭제하면 다시 생성 가능).
 */
export const LOOK_TOTAL_MAX = 20;

/**
 * 라이브러리(saved)에 보관 가능한 확정 룩 수의 상한. 계약
 * ``PHOTO_AVATAR_LIBRARY_MAX``(기본 10)에 정렬 — 후보(20)와 별개.
 */
export const LIBRARY_MAX = 10;
