import { api } from "@/lib/api";
import { downscaleImageFile } from "./imageResize";
import type {
  Avatar,
  AvatarListResult,
  CustomAvatarStatus,
  ProfilePhotoResponse,
} from "./avatarsTypes";

/**
 * 아바타 갤러리 API 래퍼.
 *
 * 백엔드(창1, PR #212) wire shape 는 snake_case + 래퍼다:
 *  - GET  /api/avatars            → { avatars: AvatarWire[], total }
 *  - PATCH /api/lectures/{id}      → { avatar_id } / { avatar_name }
 *  - POST /api/avatars/profile-photo → ProfilePhotoWire
 *      ({ photo_avatar_id, status, profile_image_url, message })
 *
 * 프론트 도메인 타입(Avatar/ProfilePhotoResponse)은 studioTypes 의
 * HeyGenAvatar 와 동일하게 ``id``/``name`` 을 쓰므로, 이 파일이 API 경계에서
 * wire → domain 으로 매핑한다 (avatar_id→id, avatar_name→name,
 * photo_avatar_id→id, profile_image_url→preview_image_url).
 *
 * 백엔드 미배포 시(404/네트워크 실패)에는 fixture/시뮬레이션으로 폴백해 UI 를
 * 개발할 수 있게 한다. 그 외 에러는 그대로 throw 해 호출자가 토스트로 표면화한다.
 */

// ── 백엔드 wire shape (창1 계약) ──────────────────────────────────────────────
interface AvatarWire {
  avatar_id: string;
  avatar_name: string;
  gender?: string | null;
  preview_image_url?: string | null;
  preview_video_url?: string | null;
  is_custom?: boolean;
}

interface AvatarsResponseWire {
  avatars: AvatarWire[];
  total: number;
}

interface ProfilePhotoResponseWire {
  photo_avatar_id: string | null;
  status: CustomAvatarStatus;
  profile_image_url: string;
  message?: string;
}

function toAvatar(w: AvatarWire): Avatar {
  return {
    id: w.avatar_id,
    name: w.avatar_name,
    gender: w.gender ?? null,
    preview_image_url: w.preview_image_url ?? null,
    preview_video_url: w.preview_video_url ?? null,
    is_custom: w.is_custom ?? false,
    // 본인 아바타는 등록 완료된 항목으로 노출되므로 ready 취급.
    status: w.is_custom ? "ready" : undefined,
  };
}

// 엔드포인트 미배포로 간주할 상태 — 404(라우트 없음) 또는 응답 자체 부재.
function isDeferredError(err: unknown): boolean {
  const e = err as { response?: { status?: number } } | undefined;
  const status = e?.response?.status;
  return status === undefined || status === 404 || status === 405;
}

// HeyGen 공개 데모 아바타 + 샘플 클립으로 구성한 fixture. 실제 미디어 URL 은
// 창1 응답으로 대체된다. 여기서는 UI(썸네일·hover 영상 재생·성별 그룹)를
// 검증할 수 있는 최소 시드만 둔다.
const FIXTURE_AVATARS: Avatar[] = [
  {
    id: "heygen-male-01",
    name: "Daniel",
    gender: "male",
    preview_image_url:
      "https://files2.heygen.ai/avatar/v3/Daniel_public/full/2.2/preview_target.webp",
    preview_video_url:
      "https://files2.heygen.ai/avatar/v3/Daniel_public/full/2.2/preview_video_target.mp4",
  },
  {
    id: "heygen-male-02",
    name: "Wayne",
    gender: "male",
    preview_image_url:
      "https://files2.heygen.ai/avatar/v3/Wayne_20240711/full/2.2/preview_target.webp",
    preview_video_url:
      "https://files2.heygen.ai/avatar/v3/Wayne_20240711/full/2.2/preview_video_target.mp4",
  },
  {
    id: "heygen-female-01",
    name: "Anna",
    gender: "female",
    preview_image_url:
      "https://files2.heygen.ai/avatar/v3/Anna_public_3_20240108/full/2.2/preview_target.webp",
    preview_video_url:
      "https://files2.heygen.ai/avatar/v3/Anna_public_3_20240108/full/2.2/preview_video_target.mp4",
  },
  {
    id: "heygen-female-02",
    name: "Susan",
    gender: "female",
    preview_image_url:
      "https://files2.heygen.ai/avatar/v3/Susan_public_2_20240328/full/2.2/preview_target.webp",
    preview_video_url:
      "https://files2.heygen.ai/avatar/v3/Susan_public_2_20240328/full/2.2/preview_video_target.mp4",
  },
];

export async function listAvatars(): Promise<AvatarListResult> {
  try {
    const { data } = await api.get<AvatarsResponseWire>("/api/avatars");
    return { avatars: (data.avatars ?? []).map(toAvatar), deferred: false };
  } catch (err) {
    if (isDeferredError(err)) {
      return { avatars: FIXTURE_AVATARS, deferred: true };
    }
    throw err;
  }
}

/** PATCH /api/lectures/{id} { avatar_id }. deferred 면 시뮬레이션 성공. */
export async function applyAvatarToLecture(
  lectureId: string,
  avatarId: string,
): Promise<void> {
  try {
    await api.patch(`/api/lectures/${lectureId}`, { avatar_id: avatarId });
  } catch (err) {
    if (isDeferredError(err)) return;
    throw err;
  }
}

/** PATCH /api/lectures/{id} { avatar_name }. deferred 면 시뮬레이션 성공. */
export async function renameAvatarForLecture(
  lectureId: string,
  avatarName: string,
): Promise<void> {
  try {
    await api.patch(`/api/lectures/${lectureId}`, { avatar_name: avatarName });
  } catch (err) {
    if (isDeferredError(err)) return;
    throw err;
  }
}

/**
 * POST /api/avatars/profile-photo (multipart).
 *
 * deferred 면 업로드한 파일로 object URL 을 만들어 미리보기를 제공하고
 * status="processing" 을 반환한다 (페이지가 ready 로 전환을 시뮬레이션).
 */
export async function uploadProfilePhoto(
  file: File,
): Promise<ProfilePhotoResponse> {
  // 고해상도·대용량 원본은 HeyGen 등록이 실패하므로 전송 전에 다운스케일·
  // JPEG 재인코딩한다(실패 시 원본 유지).
  const prepared = await downscaleImageFile(file);
  const form = new FormData();
  form.append("file", prepared);
  try {
    const { data } = await api.post<ProfilePhotoResponseWire>(
      "/api/avatars/profile-photo",
      form,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
    return {
      id: data.photo_avatar_id ?? `custom-${Date.now()}`,
      status: data.status,
      preview_image_url: data.profile_image_url ?? null,
      name: null,
    };
  } catch (err) {
    if (isDeferredError(err)) {
      const previewUrl =
        typeof URL !== "undefined" && "createObjectURL" in URL
          ? URL.createObjectURL(prepared)
          : null;
      return {
        id: `custom-${Date.now()}`,
        status: "processing",
        preview_image_url: previewUrl,
      };
    }
    throw err;
  }
}

export const __fixtures = { FIXTURE_AVATARS };
