/**
 * 아바타 갤러리 (/professor/avatars) 타입 정의.
 *
 * 백엔드 계약 (창1 — 미배포):
 *  - GET  /api/avatars                          → Avatar[]
 *  - PATCH /api/lectures/{id} { avatar_id }      → 강의에 아바타 적용
 *  - PATCH /api/lectures/{id} { avatar_name }    → 강의별 표시 이름
 *  - POST /api/avatars/profile-photo (multipart) → ProfilePhotoResponse
 *
 * 기본 wire shape 는 studioTypes.ts 의 ``HeyGenAvatar`` 와 호환되도록
 * snake_case 를 유지한다 (preview_image_url / preview_video_url).
 */

export type AvatarGender = "male" | "female";

export type CustomAvatarStatus = "processing" | "ready" | "failed";

export interface Avatar {
  id: string;
  name: string;
  preview_image_url?: string | null;
  preview_video_url?: string | null;
  /** 백엔드는 "male" | "female" | 그 외 문자열을 줄 수 있어 넓게 받는다. */
  gender?: string | null;
  /** 본인 사진으로 만든 아바타 — 목록 맨 앞에 노출. */
  is_custom?: boolean;
  /** is_custom 아바타의 생성 상태. HeyGen 표준 아바타는 항상 ready 취급. */
  status?: CustomAvatarStatus;
}

export interface ProfilePhotoResponse {
  /** 생성 중인 본인 아바타의 id (목록 갱신·폴링 키). */
  id: string;
  status: CustomAvatarStatus;
  preview_image_url?: string | null;
  name?: string | null;
}

/** GET /api/avatars 결과 래퍼. deferred=true 면 fixture 미리보기 모드. */
export interface AvatarListResult {
  avatars: Avatar[];
  /** 백엔드 미배포(404/네트워크 실패) 로 fixture 를 쓰는 중인지. */
  deferred: boolean;
}

/** 본인 음성(ElevenLabs cloned voice) 상태. */
export type VoiceCloneStatus = "none" | "ready" | "failed";

/**
 * GET/POST /api/avatars/me/voice 응답 (snake_case 그대로 소비).
 *
 * status="ready" 면 voice_id 가 GET /api/voices 계정 보이스로도 노출돼 음성
 * 패널에서 바로 선택할 수 있다.
 */
export interface VoiceClone {
  status: VoiceCloneStatus;
  voice_id?: string | null;
  name?: string | null;
  sample_url?: string | null;
  message?: string | null;
}
