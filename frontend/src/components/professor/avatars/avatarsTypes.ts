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
  /**
   * 라이브러리 룩(PhotoAvatarLook)이면 true — 연필로 이름 변경이 가능한 대상.
   * HeyGen 표준 아바타(is_custom=false)는 이름 변경 불가라 false/undefined.
   */
  isLook?: boolean;
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

/**
 * POST /api/avatars/me/voice/script 결과 — 본인 목소리 녹음용 읽기 대본.
 *
 * ``mock`` 이 true 면 대본 생성 엔드포인트가 아직 미배포라 클라이언트 예시
 * 대본을 보여주는 중(화면 안내용). 연결되면 강의 주제에 맞춘 학술 대본이 온다.
 */
export interface VoiceScriptResult {
  text: string;
  mock: boolean;
}

/**
 * 저장된 아바타 미리보기 영상의 렌더 상태.
 *  - none       : 아직 미리보기 영상을 만들지 않음(룩 썸네일 폴백)
 *  - processing : HeyGen 렌더 진행 중(스피너/배지)
 *  - ready      : preview_video_url 로 루프 영상 재생 가능
 *  - failed     : 렌더 실패(다시 만들기 가능)
 */
export type SavedAvatarPreviewStatus = "none" | "processing" | "ready" | "failed";

/**
 * "내 아바타(룩 + 음성 조합) 갤러리" 한 항목.
 *
 * 백엔드 wire(snake) 와 거의 동일한 shape 로, ``avatarsApi.toSavedAvatar`` 가
 * 누락 필드에 기본값(avatar_scale=1.0, preview_status="none", voice_id=null)을
 * 채워 정규화한다(기존 ``toAvatar`` 패턴). 미디어 URL 은 ``Avatar`` 와 동일하게
 * snake_case(preview_video_url)를 유지해 카드의 video src 로 그대로 통용된다.
 *
 * 백엔드 계약 (창2 와 합의):
 *  - GET    /api/avatars/me/saved              → SavedAvatar[] (bare array)
 *  - POST   /api/avatars/me/saved              → SavedAvatar
 *  - PATCH  /api/avatars/me/saved/{id}         → SavedAvatar
 *  - DELETE /api/avatars/me/saved/{id}         → { ok: true }
 *  - POST   /api/avatars/me/saved/{id}/preview → SavedAvatar
 *  - POST   /api/avatars/me/saved/{id}/apply   → { ok: true }
 */
export interface SavedAvatar {
  id: string;
  name: string;
  /** 렌더용 룩(avatar_id 로 통용). 룩 썸네일 폴백을 이 id 로 해석한다. */
  look_id: string;
  /** 결합 음성. null = 기본 보이스(성별 기준). */
  voice_id: string | null;
  /** 아바타 표시 배율(기본 1.0). */
  avatar_scale: number;
  /** ready 일 때만 존재 — 카드 루프 영상 src. */
  preview_video_url: string | null;
  preview_status: SavedAvatarPreviewStatus;
  /** ISO8601 생성 시각(최신순 정렬용). */
  created_at: string;
}
