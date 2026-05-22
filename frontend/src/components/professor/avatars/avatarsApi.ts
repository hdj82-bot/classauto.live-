import { api } from "@/lib/api";
import type {
  Avatar,
  AvatarListResult,
  ProfilePhotoResponse,
} from "./avatarsTypes";

/**
 * 아바타 갤러리 API 래퍼.
 *
 * 창1 의 백엔드가 아직 배포되지 않았으므로(GET /api/avatars · PATCH
 * /api/lectures/{id} 의 avatar_* 필드 · POST /api/avatars/profile-photo),
 * 엔드포인트가 없을 때(404 또는 네트워크 실패) fixture/시뮬레이션으로
 * 폴백해 UI 를 개발할 수 있게 한다. 그 외 에러는 그대로 throw 해 호출자가
 * 토스트로 표면화한다.
 *
 * 배포 후에는 폴백이 자연히 비활성화된다 (정상 200 응답을 그대로 사용).
 */

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
    const { data } = await api.get<Avatar[]>("/api/avatars");
    return { avatars: data, deferred: false };
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
  const form = new FormData();
  form.append("file", file);
  try {
    const { data } = await api.post<ProfilePhotoResponse>(
      "/api/avatars/profile-photo",
      form,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
    return data;
  } catch (err) {
    if (isDeferredError(err)) {
      const previewUrl =
        typeof URL !== "undefined" && "createObjectURL" in URL
          ? URL.createObjectURL(file)
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
