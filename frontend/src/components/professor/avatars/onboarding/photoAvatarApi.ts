import { api } from "@/lib/api";
import { downscaleImageFile } from "../imageResize";
import type {
  Look,
  LookGenerateInput,
  LookGeneration,
  LookStatus,
  PhotoAvatarErrorCode,
  PhotoAvatarGroup,
  PhotoAvatarGroupStatus,
} from "./photoAvatarTypes";

/**
 * 본인 아바타 온보딩 API 래퍼 (docs/planning/12 §7).
 *
 * 설계 의도 — 계약은 그대로 호출하고, 백엔드 미배포(404/405/네트워크 실패)
 * 시에만 **모듈 내 메모리 mock 으로 폴백**해 화면 전체를 동작시킨다. 계약이
 * 배포되면 이 파일만 그대로 두면 실제 응답이 우선하므로, 화면·훅은 수정 없이
 * 연결된다(미연결 구간은 mock, 연결되면 교체 불필요).
 *
 * mock 은 시간 기반 상태 전이로 "학습 → 완료", "룩 생성 → 완료", "미리보기
 * 렌더 → 완료"를 시뮬레이션한다. localStorage 미사용 — 모듈 스코프 메모리라
 * 새로고침 시 초기화된다(SSR/artifact 호환).
 */

// ── wire shapes (snake_case 계약) ────────────────────────────────────────────
interface GroupWire {
  group_id: string | null;
  status: PhotoAvatarGroupStatus | null;
  error_code?: string | null;
}

interface LookWire {
  look_id: string;
  image_url?: string | null;
  preview_image_url?: string | null;
  prompt?: string | null;
  status: LookStatus;
}

interface PreviewWire {
  status: "not_started" | "processing" | "ready" | "failed";
  video_url?: string | null;
  voice_id?: string | null;
  message?: string | null;
}

export type PhotoAvatarPreviewStatus = PreviewWire["status"];

export interface PhotoAvatarPreview {
  status: PhotoAvatarPreviewStatus;
  videoUrl: string | null;
  voiceId: string | null;
  message: string | null;
  /** 백엔드 미배포로 mock 영상을 보여주는 중인지 (UI 안내용). */
  deferred?: boolean;
}

// 한 번이라도 mock 폴백을 탔는지 — UI 의 "미배포 안내 배너" 표시용.
let deferredMode = false;

/** 현재 mock 폴백 모드인지(백엔드 미배포). */
export function isDeferredMode(): boolean {
  return deferredMode;
}

/** 엔드포인트 미배포로 간주 — 404/405(라우트 없음) 또는 응답 자체 부재. */
function isDeferredError(err: unknown): boolean {
  const e = err as { response?: { status?: number } } | undefined;
  const status = e?.response?.status;
  const deferred = status === undefined || status === 404 || status === 405;
  if (deferred) deferredMode = true;
  return deferred;
}

// ── deferred mock store (모듈 메모리) ────────────────────────────────────────
// v0.2(provider=gpt): train 없음 → 업로드 즉시 그룹 ready. 룩 생성만 비동기.
const LOOK_MS = 5000; // 룩 1배치 생성 완료까지
const PREVIEW_MS = 6500; // 움직이는 미리보기 렌더 완료까지

// mock 미리보기에 쓰는 HeyGen 공개 샘플 클립(avatarsApi fixture 와 동일 출처).
// 계약 연결 시에는 실제 /api/avatars/me/preview 영상으로 대체된다.
const MOCK_PREVIEW_VIDEO =
  "https://files2.heygen.ai/avatar/v3/Daniel_public/full/2.2/preview_video_target.mp4";

interface MockLook {
  look_id: string;
  prompt: string | null;
  status: LookStatus;
  startedAt: number;
  image_url: string | null;
  preview_image_url: string | null;
}

interface MockStore {
  group: { group_id: string; status: PhotoAvatarGroupStatus; startedAt: number } | null;
  looks: MockLook[];
  selectedLookId: string | null;
  preview: { status: PhotoAvatarPreviewStatus; startedAt: number; voiceId: string | null } | null;
}

const mock: MockStore = {
  group: null,
  looks: [],
  selectedLookId: null,
  preview: null,
};

let lookSeq = 0;
const now = () => Date.now();

/**
 * mock 룩 썸네일 — 라이트 베이지 배경 + 골드 그라데이션 실루엣의 3:4 SVG
 * data URI. 외부 이미지에 의존하지 않고 룩마다 살짝 다른 톤으로 구분된다
 * (design-system: 이모지/플레이스홀더는 골드 그라데이션 SVG로 통일).
 */
function makeLookPreview(index: number): string {
  const stop = ["#FFC74D", "#FFB627", "#E89E0E", "#B88308"][index % 4];
  const tint = 0.06 + (index % 4) * 0.03;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="320" viewBox="0 0 240 320">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#FFC74D"/><stop offset="100%" stop-color="${stop}"/>
  </linearGradient></defs>
  <rect width="240" height="320" fill="#FAFAF7"/>
  <rect width="240" height="320" fill="${stop}" opacity="${tint}"/>
  <circle cx="120" cy="118" r="46" fill="url(#g)"/>
  <path d="M44 320c0-46 34-78 76-78s76 32 76 78z" fill="url(#g)"/>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function mockGroupToDomain(): PhotoAvatarGroup {
  if (!mock.group) return { group_id: null, status: "none" };
  // v0.2: gpt provider 는 train 이 없어 그룹은 생성 즉시 ready 다.
  return { group_id: mock.group.group_id, status: mock.group.status };
}

function mockLooksToDomain(): Look[] {
  let readyIndex = 0;
  return mock.looks.map((l) => {
    if (l.status === "generating" && now() - l.startedAt > LOOK_MS) {
      l.status = "ready";
      // v0.2 룩은 image_url(S3) 이 1차 소스 — mock 은 SVG data URI 로 채운다.
      l.image_url = makeLookPreview(readyIndex);
      l.preview_image_url = l.image_url;
    }
    if (l.status === "ready") readyIndex += 1;
    return {
      look_id: l.look_id,
      image_url: l.image_url,
      preview_image_url: l.preview_image_url,
      prompt: l.prompt,
      status: l.status,
    };
  });
}

// ── ① 사진 업로드 → 그룹 생성 + 학습 시작 ───────────────────────────────────
/** POST /api/avatars/me/photo-avatar (multipart). deferred 면 mock 그룹 생성. */
export async function uploadPhotoAvatar(file: File): Promise<PhotoAvatarGroup> {
  // 온보딩 업로드도 프로필 사진 경로(avatarsApi.uploadProfilePhoto)와 동일하게
  // 전송 전 클라이언트 다운스케일·JPEG 재인코딩한다. 풀 사이즈 원본을 그대로
  // 올리면 HeyGen 등록이 느려지거나 실패하므로 이탈 위험이 컸다.
  // downscaleImageFile 은 어떤 단계든 실패하면 원본 File 을 그대로 돌려주므로
  // 업로드 자체를 막지 않는다(graceful).
  const prepared = await downscaleImageFile(file);
  const form = new FormData();
  form.append("file", prepared);
  try {
    const { data } = await api.post<GroupWire>(
      "/api/avatars/me/photo-avatar",
      form,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
    // v0.2 gpt: 백엔드가 즉시 ready 로 응답. status 미제공 시 ready 로 가정.
    return { group_id: data.group_id ?? null, status: data.status ?? "ready" };
  } catch (err) {
    if (isDeferredError(err)) {
      // train 없는 v0.2 — mock 도 업로드 즉시 ready(룩 생성 가능).
      mock.group = { group_id: "grp-mock", status: "ready", startedAt: now() };
      // 새 사진으로 다시 시작하면 이전 룩/선택/미리보기는 무효.
      mock.looks = [];
      mock.selectedLookId = null;
      mock.preview = null;
      return { group_id: mock.group.group_id, status: "ready" };
    }
    throw err;
  }
}

/** error_code 문자열을 알려진 분류 코드로 정규화(미지의 값은 "unknown"). */
function toErrorCode(raw: string | null | undefined): PhotoAvatarErrorCode | null {
  if (!raw) return null;
  return raw === "insufficient_credit" || raw === "invalid_image"
    ? raw
    : "unknown";
}

/** GET /api/avatars/me/photo-avatar — 그룹 학습 상태 폴링. deferred 면 mock. */
export async function getPhotoAvatar(): Promise<PhotoAvatarGroup> {
  try {
    const { data } = await api.get<GroupWire>("/api/avatars/me/photo-avatar");
    return {
      group_id: data.group_id ?? null,
      status: data.status ?? "none",
      errorCode: toErrorCode(data.error_code),
    };
  } catch (err) {
    if (isDeferredError(err)) return mockGroupToDomain();
    throw err;
  }
}

// ── ② gpt 룩 배치 생성 (v0.2 구조화 옵션) ────────────────────────────────────
/**
 * POST /api/avatars/me/looks — 구조화 필드(persona 필수 + outfit/background/
 * expression/extra)로 룩 ``count`` 개를 배치 생성한다(계약 LookGenerateRequest).
 * deferred 면 mock 배치를 push 한다. mock 라벨은 옵션을 사람이 읽을 수 있게 요약.
 */
export async function generateLooks(
  input: LookGenerateInput,
  count: number,
): Promise<LookGeneration> {
  try {
    const { data } = await api.post<LookGeneration>("/api/avatars/me/looks", {
      persona: input.persona,
      outfit: input.outfit ?? null,
      background: input.background ?? null,
      expression: input.expression ?? null,
      extra: input.extra ?? null,
      count,
    });
    return data;
  } catch (err) {
    if (isDeferredError(err)) {
      const started = now();
      const label = mockLookLabel(input);
      for (let i = 0; i < count; i += 1) {
        lookSeq += 1;
        mock.looks.push({
          look_id: `look-mock-${lookSeq}`,
          prompt: label,
          status: "generating",
          startedAt: started,
          image_url: null,
          preview_image_url: null,
        });
      }
      return { generation_id: `gen-mock-${started}` };
    }
    throw err;
  }
}

/** mock 룩 라벨 — 구조화 옵션을 사람이 읽을 수 있는 한 줄로(디버그·미배포 표기용). */
function mockLookLabel(input: LookGenerateInput): string {
  return [input.persona, input.outfit, input.background, input.expression]
    .filter(Boolean)
    .join(" · ");
}

/** GET /api/avatars/me/looks — 룩 목록·생성 상태. deferred 면 mock(시간 전이). */
export async function listLooks(): Promise<Look[]> {
  try {
    const { data } = await api.get<LookWire[]>("/api/avatars/me/looks");
    return (data ?? []).map((w) => ({
      look_id: w.look_id,
      image_url: w.image_url ?? null,
      preview_image_url: w.preview_image_url ?? null,
      prompt: w.prompt ?? null,
      status: w.status,
    }));
  } catch (err) {
    if (isDeferredError(err)) return mockLooksToDomain();
    throw err;
  }
}

// ── ③' 룩 삭제 (라이브러리 정리) ─────────────────────────────────────────────
/** DELETE /api/avatars/me/looks/{id}. deferred 면 mock 에서 제거. */
export async function deleteLook(lookId: string): Promise<{ ok: boolean }> {
  try {
    const { data } = await api.delete<{ ok: boolean }>(
      `/api/avatars/me/looks/${encodeURIComponent(lookId)}`,
    );
    return { ok: data?.ok ?? true };
  } catch (err) {
    if (isDeferredError(err)) {
      mock.looks = mock.looks.filter((l) => l.look_id !== lookId);
      if (mock.selectedLookId === lookId) mock.selectedLookId = null;
      return { ok: true };
    }
    throw err;
  }
}

// ── ④ 기본 룩 선택 ───────────────────────────────────────────────────────────
/** POST /api/avatars/me/looks/{id}/select. deferred 면 mock 선택 기록. */
export async function selectLook(lookId: string): Promise<{ ok: boolean }> {
  try {
    const { data } = await api.post<{ ok: boolean }>(
      `/api/avatars/me/looks/${encodeURIComponent(lookId)}/select`,
    );
    return { ok: data?.ok ?? true };
  } catch (err) {
    if (isDeferredError(err)) {
      mock.selectedLookId = lookId;
      return { ok: true };
    }
    throw err;
  }
}

// ── ⑤ 움직이는 미리보기 (재사용 엔드포인트 /api/avatars/me/preview) ───────────
//
// 기존 avatarsApi 의 getAvatarPreview/startAvatarPreview 와 같은 엔드포인트를
// 쓰지만, 온보딩은 미배포 시에도 "움직이는" 화면을 완성해야 하므로 mock 에서
// 샘플 클립을 ready 로 돌려준다. 계약 연결 시 실제 영상이 우선한다.

function toPreviewDomain(w: PreviewWire, deferred = false): PhotoAvatarPreview {
  return {
    status: w.status,
    videoUrl: w.video_url ?? null,
    voiceId: w.voice_id ?? null,
    message: w.message ?? null,
    deferred,
  };
}

/** GET /api/avatars/me/preview — 캐시/진행 상태. deferred 면 mock 전이. */
export async function getPhotoAvatarPreview(): Promise<PhotoAvatarPreview> {
  try {
    const { data } = await api.get<PreviewWire>("/api/avatars/me/preview");
    return toPreviewDomain(data);
  } catch (err) {
    if (isDeferredError(err)) {
      if (!mock.preview) return toPreviewDomain({ status: "not_started" }, true);
      if (
        mock.preview.status === "processing" &&
        now() - mock.preview.startedAt > PREVIEW_MS
      ) {
        mock.preview.status = "ready";
      }
      return toPreviewDomain(
        {
          status: mock.preview.status,
          video_url: mock.preview.status === "ready" ? MOCK_PREVIEW_VIDEO : null,
          voice_id: mock.preview.voiceId,
        },
        true,
      );
    }
    throw err;
  }
}

/** POST /api/avatars/me/preview — 본인 목소리로 렌더 시작(또는 캐시 반환). */
export async function startPhotoAvatarPreview(
  voiceId?: string | null,
  force = false,
): Promise<PhotoAvatarPreview> {
  try {
    const { data } = await api.post<PreviewWire>("/api/avatars/me/preview", {
      voice_id: voiceId ?? null,
      force,
    });
    return toPreviewDomain(data);
  } catch (err) {
    if (isDeferredError(err)) {
      mock.preview = { status: "processing", startedAt: now(), voiceId: voiceId ?? null };
      return toPreviewDomain({ status: "processing", voice_id: voiceId ?? null }, true);
    }
    throw err;
  }
}

/** 테스트용 — mock 상태를 비운다. */
export function __resetMock() {
  mock.group = null;
  mock.looks = [];
  mock.selectedLookId = null;
  mock.preview = null;
  lookSeq = 0;
  deferredMode = false;
}
