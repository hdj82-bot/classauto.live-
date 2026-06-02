import { api } from "@/lib/api";
import { downscaleImageFile } from "./imageResize";
import type {
  Avatar,
  AvatarListResult,
  CustomAvatarStatus,
  ProfilePhotoResponse,
  VoiceClone,
  VoiceScriptResult,
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

// ── 본인 아바타 "움직이는 미리보기" (POST/GET /api/avatars/me/preview) ──────────

export type AvatarPreviewStatus =
  | "not_started"
  | "processing"
  | "ready"
  | "failed";

export interface AvatarPreview {
  status: AvatarPreviewStatus;
  video_url?: string | null;
  voice_id?: string | null;
  message?: string | null;
}

/** GET /api/avatars/me/preview — 캐시/진행 상태 조회. deferred 면 not_started. */
export async function getAvatarPreview(): Promise<AvatarPreview> {
  try {
    const { data } = await api.get<AvatarPreview>("/api/avatars/me/preview");
    return data;
  } catch (err) {
    if (isDeferredError(err)) return { status: "not_started" };
    throw err;
  }
}

/**
 * POST /api/avatars/me/preview — 렌더 시작(또는 캐시 반환).
 * voiceId 를 주면 그 음성으로 렌더한다. force=true 면 캐시 무시하고 재생성.
 */
export async function startAvatarPreview(
  voiceId?: string | null,
  force = false,
): Promise<AvatarPreview> {
  try {
    const { data } = await api.post<AvatarPreview>("/api/avatars/me/preview", {
      voice_id: voiceId ?? null,
      force,
    });
    return data;
  } catch (err) {
    if (isDeferredError(err)) {
      return {
        status: "failed",
        message: "백엔드 연결 후 사용할 수 있습니다.",
      };
    }
    throw err;
  }
}

// ── 본인 음성 클로닝 (GET/POST/DELETE /api/avatars/me/voice) ───────────────────

/** GET /api/avatars/me/voice — 본인 음성 상태. deferred 면 none. */
export async function getMyVoice(): Promise<VoiceClone> {
  try {
    const { data } = await api.get<VoiceClone>("/api/avatars/me/voice");
    return data;
  } catch (err) {
    if (isDeferredError(err)) return { status: "none" };
    throw err;
  }
}

/**
 * POST /api/avatars/me/voice (multipart) — 음성 샘플(mp3 등)로 본인 음성 생성/교체.
 * gender("male"|"female") 는 음성 패널 남/여 그룹 분류에 쓰인다(선택).
 */
export async function uploadVoiceSample(
  file: File,
  gender?: "male" | "female" | null,
): Promise<VoiceClone> {
  const form = new FormData();
  form.append("file", file);
  if (gender) form.append("gender", gender);
  try {
    const { data } = await api.post<VoiceClone>("/api/avatars/me/voice", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  } catch (err) {
    if (isDeferredError(err)) {
      return {
        status: "failed",
        message: "백엔드 연결 후 사용할 수 있습니다.",
      };
    }
    throw err;
  }
}

/** DELETE /api/avatars/me/voice — 본인 음성 삭제. */
export async function deleteMyVoice(): Promise<VoiceClone> {
  try {
    const { data } = await api.delete<VoiceClone>("/api/avatars/me/voice");
    return data;
  } catch (err) {
    if (isDeferredError(err)) return { status: "none" };
    throw err;
  }
}

// ── 녹음용 읽기 대본 (POST /api/avatars/me/voice/script) ───────────────────────
//
// 다른 창이 추가 중인 엔드포인트. 미배포(404/405)면 강의 주제에 연관된 ~500자
// 학술 예시 대본으로 폴백해 녹음 화면을 완성한다(mock=true 안내). ElevenLabs IVC
// 는 1분 내외 깨끗한 샘플이면 충분하므로, 대본은 또렷이 읽기 좋은 분량으로 둔다.

/** 녹음 대본 언어 (UI 선택창과 동일). */
export type ScriptLanguage = "ko" | "en" | "zh" | "ja";

// deferred 폴백 대본을 호출마다 번갈아 주기 위한 순환 인덱스("다른 대본").
let scriptVariant = 0;

// 언어별 mock 대본 — 강의 주제(subject)를 끼운 ~수백자 학술 산문. 대본 생성
// 엔드포인트(#278)가 미배포이거나 언어 지원 전이어도 화면을 완성한다.
const MOCK_DEFAULT_SUBJECT: Record<ScriptLanguage, string> = {
  ko: "오늘 강의 주제",
  en: "today's lecture topic",
  zh: "今天的课程主题",
  ja: "本日の講義テーマ",
};

function mockScriptVariants(lang: ScriptLanguage, subject: string): string[] {
  switch (lang) {
    case "en":
      return [
        `Hello, everyone. Today we will look closely at ${subject}. ` +
          `Let's first define the key ideas and trace why they matter, step by step. ` +
          `Scholarship begins with good questions, and even facts we take for granted ` +
          `often reveal new meaning when we examine them again. Jot down any questions ` +
          `that come to mind and share them freely during our discussion. Let's begin.`,
        `Welcome back. Continuing from last time, we'll work through the details of ${subject}. ` +
          `I'll lay out the theoretical frame first, then use concrete examples to show how it ` +
          `works in practice. Moving between concept and example helps the ideas stay with you. ` +
          `I'll pronounce the important terms slowly, so feel free to read along with me.`,
      ];
    case "zh":
      return [
        `同学们好。这节课我们一起来探讨${subject}。` +
          `我们先界定核心概念，再一步步说明它为什么重要。学问往往从一个好问题开始，` +
          `那些我们习以为常的事实，重新审视时常常会显出新的意义。` +
          `听课时如果有疑问，请随手记下，留到讨论环节自由交流。那么我们正式开始。`,
        `各位好。接续上一讲，我们来细看${subject}的具体内容。` +
          `先梳理理论框架，再通过实例说明它在实践中如何运作。` +
          `在概念与实例之间往返理解，记忆会更加牢固。重要术语我会放慢、清晰地念出来，` +
          `大家可以跟着一起读。学习重在方向，让我们沉下心来开始。`,
      ];
    case "ja":
      return [
        `皆さん、こんにちは。今回は${subject}について一緒に見ていきます。` +
          `まず重要な概念を定義し、なぜそれが大切なのかを順を追って確かめましょう。` +
          `学問は良い問いから始まります。当たり前と思っていた事実も、改めて問い直すと` +
          `新しい意味が見えてきます。疑問が浮かんだら書き留め、討論の時間に自由に共有してください。`,
        `こんにちは。前回に続いて、${subject}の詳しい内容を扱います。` +
          `まず理論の枠組みを整理し、具体例を通してそれが実際にどう働くのかを確認します。` +
          `概念と具体例を行き来すると、記憶に長く残ります。重要な用語はゆっくり、` +
          `はっきり発音しますので、一緒に読んでみてください。`,
      ];
    case "ko":
    default:
      return [
        `안녕하세요, 여러분. 이번 시간에는 ${subject}에 대해 함께 살펴보겠습니다. ` +
          `먼저 핵심 개념을 정의하고, 그것이 왜 중요한지 배경부터 차근차근 짚어 보려고 합니다. ` +
          `학문이라는 것은 결국 좋은 질문에서 출발합니다. 우리가 당연하게 여겨 온 사실도 ` +
          `다시 따져 보면 새로운 의미를 드러내곤 합니다. 강의를 들으며 떠오르는 의문은 메모해 ` +
          `두었다가 토론 시간에 자유롭게 나누어 주시기 바랍니다. 그럼 본격적으로 시작하겠습니다.`,
        `반갑습니다. 지난 시간에 이어 ${subject}의 세부 내용을 다루겠습니다. ` +
          `이론적 틀을 먼저 정리한 뒤, 구체적인 사례를 통해 그 틀이 실제로 어떻게 작동하는지 ` +
          `확인하겠습니다. 개념과 사례를 오가며 이해하면 기억에 훨씬 오래 남습니다. ` +
          `중요한 용어는 천천히, 또박또박 발음하겠으니 함께 따라 읽어 보셔도 좋습니다. ` +
          `학습은 속도가 아니라 방향이 중요합니다. 차분히 호흡을 가다듬고 시작해 봅시다.`,
        `여러분, 좋은 아침입니다. 오늘은 ${subject}를 중심으로 생각의 폭을 넓혀 보겠습니다. ` +
          `복잡해 보이는 주제일수록 큰 그림을 먼저 그리고 세부로 들어가는 편이 좋습니다. ` +
          `제가 설명하는 동안, 머릿속으로 자신의 경험과 연결해 보시기를 권합니다. ` +
          `배움은 새로운 정보를 이미 아는 것과 잇는 과정이기 때문입니다. ` +
          `질문이 생기면 언제든 환영합니다. 그럼 첫 번째 주제부터 함께 펼쳐 보겠습니다.`,
      ];
  }
}

/** 강의 주제·언어를 엮은 학술 mock 대본 (대본 API 미배포/언어 미지원 폴백). */
function mockVoiceScript(topic: string | null, lang: ScriptLanguage): string {
  const subject = topic && topic.trim() ? topic.trim() : MOCK_DEFAULT_SUBJECT[lang];
  const variants = mockScriptVariants(lang, subject);
  const text = variants[scriptVariant % variants.length];
  scriptVariant += 1;
  return text;
}

/**
 * POST /api/avatars/me/voice/script — 녹음용 읽기 대본 생성.
 * topic 은 현재 강의 제목(없으면 null), language 는 대본 언어(ko/en/zh/ja).
 * 미배포(404)면 언어에 맞춘 mock 대본으로 폴백한다. (언어 지원이 백엔드에
 * 아직 없으면 서버는 language 를 무시하고 기본 언어 대본을 줄 수 있다 — 그 경우
 * 연결 표시(mock=false)만 반영된다.)
 */
export async function requestVoiceScript(
  topic: string | null,
  language: ScriptLanguage = "ko",
): Promise<VoiceScriptResult> {
  try {
    const { data } = await api.post<{ script: string }>(
      "/api/avatars/me/voice/script",
      { topic: topic ?? null, language },
    );
    return { text: data.script, mock: false };
  } catch (err) {
    if (isDeferredError(err)) {
      return { text: mockVoiceScript(topic, language), mock: true };
    }
    throw err;
  }
}

// ── 강의 제목 조회 (대본 주제용) ──────────────────────────────────────────────
interface LectureLite {
  id: string;
  title?: string | null;
}

/**
 * 강의 제목을 best-effort 로 가져온다(대본 생성 topic 용). 단일 엔드포인트
 * ``GET /api/me/lectures``(PR #261) 에서 id 로 찾는다. 미배포·실패·미발견이면
 * null 을 돌려주며, 호출자는 topic=null 로 대본을 요청한다(엔드포인트가 일반
 * 학술 대본을 반환).
 */
export async function getLectureTitle(
  lectureId: string,
): Promise<string | null> {
  try {
    const { data } = await api.get<LectureLite[]>("/api/me/lectures");
    const found = (data ?? []).find((l) => l.id === lectureId);
    return found?.title?.trim() || null;
  } catch {
    return null;
  }
}

// ── 저장된 본인 룩 라이브러리 (GET /api/avatars/me/looks) ─────────────────────
//
// 온보딩(photoAvatarApi.listLooks)과 같은 엔드포인트지만, 갤러리 페이지는 이미
// 만든 룩을 "라이브러리"로 보여 주고 재생성 없이 바로 선택/적용하는 용도로 쓴다.
// 온보딩 래퍼(소유 밖)를 건드리지 않도록 별도 함수로 같은 계약을 호출한다.

/** 백엔드 LookItem wire (avatars.py LookItem). */
interface LookItemWire {
  look_id: string;
  preview_image_url?: string | null;
  prompt?: string | null;
  status: "generating" | "ready" | "failed";
  is_default?: boolean;
  saved?: boolean;
}

/** 저장된 본인 Design with AI 룩 1개 (라이브러리 항목). */
export interface MyLook {
  /** HeyGen 룩 id — 렌더용 avatar_id 로 그대로 통용된다(video.py 참고). */
  id: string;
  preview_image_url: string | null;
  prompt: string | null;
  status: "generating" | "ready" | "failed";
  /** 교수자가 기본 룩(모든 강의 폴백)으로 지정한 항목이면 true. */
  is_default: boolean;
  /** 라이브러리에 저장(확정)된 룩이면 true. 라이브러리는 이 값이 true 인 것만 노출. */
  saved: boolean;
}

/** GET /api/avatars/me/looks — 저장된 본인 룩 목록. deferred(미배포)면 빈 목록. */
export async function listMyLooks(): Promise<MyLook[]> {
  try {
    const { data } = await api.get<LookItemWire[]>("/api/avatars/me/looks");
    return (data ?? []).map((w) => ({
      id: w.look_id,
      preview_image_url: w.preview_image_url ?? null,
      prompt: w.prompt ?? null,
      status: w.status,
      is_default: w.is_default ?? false,
      saved: w.saved ?? false,
    }));
  } catch (err) {
    if (isDeferredError(err)) return [];
    throw err;
  }
}

// ── 최근 선택한 아바타 (GET/POST /api/avatars/me/recent) ───────────────────────
//
// 가장 최근에 고른 아바타/룩 id 를 서버에 영속화한다(localStorage 미사용). 다음
// 방문 시 "최근 선택한 아바타" 박스로 복원해 재생성 없이 바로 강의에 적용한다.

/** GET /api/avatars/me/recent — 최근 선택 id. deferred 면 null. */
export async function getRecentAvatarId(): Promise<string | null> {
  try {
    const { data } = await api.get<{ avatar_id: string | null }>(
      "/api/avatars/me/recent",
    );
    return data?.avatar_id ?? null;
  } catch (err) {
    if (isDeferredError(err)) return null;
    throw err;
  }
}

/** POST /api/avatars/me/recent — 최근 선택 기록. deferred 면 조용히 무시(no-op). */
export async function setRecentAvatar(avatarId: string): Promise<void> {
  try {
    await api.post("/api/avatars/me/recent", { avatar_id: avatarId });
  } catch (err) {
    if (isDeferredError(err)) return;
    throw err;
  }
}

export const __fixtures = { FIXTURE_AVATARS };
