import { api } from "@/lib/api";
import { downscaleImageFile } from "./imageResize";
import type {
  Avatar,
  AvatarListResult,
  CustomAvatarStatus,
  HeyGenAvatarGroup,
  ProfilePhotoResponse,
  SavedAvatar,
  SavedAvatarPreviewStatus,
  StandardAvatar,
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

// HeyGen 카탈로그 조회는 공유 계정이라 느리거나 레이트리밋이 잦다. 전역 axios 에
// timeout 이 없어 이 한 호출이 무한정 매달리면 아바타 페이지가 통째로 멈춘다(이전
// "5분 넘게 빈 화면" 이탈의 직접 원인). 12초 안에 못 받으면 timeout 으로 끊고
// fixture 폴백(deferred 배너)으로 떨어뜨려, 교수자가 본인 사진 업로드·저장된
// 아바타 선택 등 HeyGen 과 무관한 작업을 곧바로 이어갈 수 있게 한다.
const _AVATARS_FETCH_TIMEOUT_MS = 12_000;

export async function listAvatars(): Promise<AvatarListResult> {
  try {
    const { data } = await api.get<AvatarsResponseWire>("/api/avatars", {
      timeout: _AVATARS_FETCH_TIMEOUT_MS,
    });
    return { avatars: (data.avatars ?? []).map(toAvatar), deferred: false };
  } catch (err) {
    // timeout(ECONNABORTED)·미배포·기타 카탈로그 실패는 모두 fixture 로 폴백한다.
    // 빈 카탈로그라도 페이지는 즉시 동작해야 하므로 throw 하지 않는다.
    if (isDeferredError(err) || _isTimeout(err)) {
      return { avatars: FIXTURE_AVATARS, deferred: true };
    }
    throw err;
  }
}

/** axios timeout(ECONNABORTED) 또는 네트워크 단절 여부. */
function _isTimeout(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  return (
    e?.code === "ECONNABORTED" ||
    e?.code === "ERR_NETWORK" ||
    /timeout/i.test(e?.message ?? "")
  );
}

/** 강의에 지정된 아바타 정보(표시용) — GET /api/lectures/{id} 의 부분 투영. */
export interface LectureAvatarInfo {
  avatar_id: string | null;
  avatar_name: string | null;
  /** 미리보기 썸네일 이미지 URL (적용 시 비정규화 저장). */
  avatar_preview_url: string | null;
  /** 미리보기 루프 영상 URL (클릭 시 재생). */
  avatar_preview_video_url: string | null;
}

/**
 * GET /api/lectures/{id} — "현재 지정된 아바타" 표시에 필요한 필드만 추린다.
 * 표시 전용이라 어떤 실패(미배포·404·네트워크)에서도 throw 하지 않고 null 을 돌려
 * 칩이 조용히 비워지게 한다(페이지 동작에 영향 없음).
 */
export async function getLectureAvatar(
  lectureId: string,
): Promise<LectureAvatarInfo | null> {
  try {
    const { data } = await api.get<{
      avatar_id?: string | null;
      avatar_name?: string | null;
      avatar_preview_url?: string | null;
      avatar_preview_video_url?: string | null;
    }>(`/api/lectures/${lectureId}`);
    return {
      avatar_id: data.avatar_id ?? null,
      avatar_name: data.avatar_name ?? null,
      avatar_preview_url: data.avatar_preview_url ?? null,
      avatar_preview_video_url: data.avatar_preview_video_url ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * PATCH /api/lectures/{id} { avatar_id }. deferred 면 시뮬레이션 성공.
 *
 * ``preview`` 를 함께 넘기면 미리보기 썸네일/영상 URL 도 강의에 비정규화 저장한다
 * (studio 우측 패널·"현재 지정된 아바타" 표시용). undefined 인 필드는 PATCH 에서
 * 빠져 기존 값을 보존한다.
 */
export async function applyAvatarToLecture(
  lectureId: string,
  avatarId: string,
  preview?: { imageUrl?: string | null; videoUrl?: string | null },
): Promise<void> {
  try {
    await api.patch(`/api/lectures/${lectureId}`, {
      avatar_id: avatarId,
      ...(preview && "imageUrl" in preview
        ? { avatar_preview_url: preview.imageUrl ?? null }
        : {}),
      ...(preview && "videoUrl" in preview
        ? { avatar_preview_video_url: preview.videoUrl ?? null }
        : {}),
    });
  } catch (err) {
    if (isDeferredError(err)) return;
    throw err;
  }
}

/**
 * PATCH /api/lectures/{id} — 미리보기 썸네일/영상 URL 만 갱신한다(avatar_id 불변).
 * 저장 조합 적용(applySavedAvatar)처럼 서버가 avatar_id 를 정하는 경로에서, 적용
 * 직후 표시용 미리보기를 강의에 비정규화해 두는 데 쓴다. deferred 면 조용히 성공.
 */
export async function saveLectureAvatarPreview(
  lectureId: string,
  preview: { imageUrl?: string | null; videoUrl?: string | null },
): Promise<void> {
  try {
    await api.patch(`/api/lectures/${lectureId}`, {
      avatar_preview_url: preview.imageUrl ?? null,
      avatar_preview_video_url: preview.videoUrl ?? null,
    });
  } catch (err) {
    if (isDeferredError(err)) return;
    throw err;
  }
}

/**
 * PATCH /api/lectures/{id} { voice_id }. deferred 면 시뮬레이션 성공.
 *
 * "룩과 목소리 아바타 제작" 시 선택한 룩(avatar_id)과 함께 호출해 Q&A 아바타의
 * 목소리(본인 클론 또는 샘플 보이스)를 강의에 적용한다. voiceId=null 은 "기본
 * 보이스(성별 기준)" 를 의미한다(studio 음성 패널과 동일 계약).
 */
export async function applyVoiceToLecture(
  lectureId: string,
  voiceId: string | null,
): Promise<void> {
  try {
    await api.patch(`/api/lectures/${lectureId}`, { voice_id: voiceId });
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
 * text 를 주면 아바타가 그 대본을 말한다(스크립트 테스트). 없으면 기본 샘플.
 * avatarId 를 주면 등록한 표준 아바타(Video Avatar)로 렌더한다(전신 자연 움직임).
 * 없으면 본인 포토 아바타(Talking Photo).
 */
export async function startAvatarPreview(
  voiceId?: string | null,
  force = false,
  text?: string | null,
  avatarId?: string | null,
): Promise<AvatarPreview> {
  try {
    const { data } = await api.post<AvatarPreview>("/api/avatars/me/preview", {
      voice_id: voiceId ?? null,
      force,
      text: text ?? null,
      avatar_id: avatarId ?? null,
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
  name?: string | null;
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
  /** 교수자가 직접 붙인 룩 이름(연필). 없으면 null → 프론트가 폴백 라벨 표시. */
  name: string | null;
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
      name: w.name ?? null,
      status: w.status,
      is_default: w.is_default ?? false,
      saved: w.saved ?? false,
    }));
  } catch (err) {
    if (isDeferredError(err)) return [];
    throw err;
  }
}

/**
 * POST /api/avatars/me/looks/upload — 교수자 본인 사진을 라이브러리 룩으로 직접
 * 업로드한다(AI 룩 생성 대체). 고화질 16:9 원본을 받으므로 클라이언트 다운스케일
 * 없이 그대로 전송한다(백엔드가 렌더 시 안전 사이즈로 정규화). 미배포(deferred)면
 * 오브젝트 URL 로 시뮬레이션한 룩을 돌려준다.
 */
export async function uploadOwnFaceLook(file: File): Promise<MyLook> {
  const form = new FormData();
  form.append("file", file);
  try {
    const { data } = await api.post<LookItemWire>(
      "/api/avatars/me/looks/upload",
      form,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
    return {
      id: data.look_id,
      preview_image_url: data.preview_image_url ?? null,
      prompt: data.prompt ?? null,
      name: data.name ?? null,
      status: data.status,
      is_default: data.is_default ?? false,
      saved: data.saved ?? true,
    };
  } catch (err) {
    if (isDeferredError(err)) {
      const previewUrl =
        typeof URL !== "undefined" && "createObjectURL" in URL
          ? URL.createObjectURL(file)
          : null;
      return {
        id: `look-${Date.now()}`,
        preview_image_url: previewUrl,
        prompt: null,
        name: null,
        status: "ready",
        is_default: false,
        saved: true,
      };
    }
    throw err;
  }
}

/**
 * PATCH /api/avatars/me/looks/{id}/name — 룩 표시 이름을 저장한다(연필).
 * 빈 문자열/공백이면 이름 해제(null). 미배포(404 등)는 멱등 성공으로 폴백.
 */
export async function renameMyLook(
  lookId: string,
  name: string,
): Promise<{ ok: boolean; name: string | null }> {
  try {
    const { data } = await api.patch<{ ok: boolean; name: string | null }>(
      `/api/avatars/me/looks/${encodeURIComponent(lookId)}/name`,
      { name },
    );
    return { ok: data?.ok ?? true, name: data?.name ?? null };
  } catch (err) {
    if (isDeferredError(err)) return { ok: true, name: name.trim() || null };
    throw err;
  }
}

/**
 * DELETE /api/avatars/me/looks/{id} — 저장된 룩 1개를 라이브러리에서 삭제한다.
 * 미배포/이미 없음(404)은 멱등하게 성공으로 본다(폴백). 그 외 오류는 throw.
 */
export async function deleteMyLook(lookId: string): Promise<{ ok: boolean }> {
  try {
    const { data } = await api.delete<{ ok: boolean }>(
      `/api/avatars/me/looks/${encodeURIComponent(lookId)}`,
    );
    return { ok: data?.ok ?? true };
  } catch (err) {
    if (isDeferredError(err)) return { ok: true };
    throw err;
  }
}

/**
 * DELETE /api/avatars/me/photo-avatar — 직접 올린 프로필 사진으로 만든 '본인
 * 아바타'(GET /api/avatars 의 is_custom 카드)를 삭제한다. 룩(PhotoAvatarLook)이
 * 아니라 user.photo_avatar_id 합성 항목이므로 deleteMyLook 으로는 지워지지 않는다
 * (404 → 목록 재조회에서 부활하던 버그). 백엔드가 사진·캐시를 함께 비운다.
 */
export async function deleteOwnPhotoAvatar(): Promise<{ ok: boolean }> {
  try {
    const { data } = await api.delete<{ ok: boolean }>(
      "/api/avatars/me/photo-avatar",
    );
    return { ok: data?.ok ?? true };
  } catch (err) {
    if (isDeferredError(err)) return { ok: true };
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

// ── Q&A 본인 얼굴 옵트인 (GET/PATCH /api/avatars/me/qa-face) ───────────────────
//
// Q&A 답변 영상에 본인 얼굴(Talking Photo)을 쓸지 여부. 기본은 OFF(표준 아바타) —
// HeyGen "사진 아바타 3개 한도"는 계정 단위라 모든 교수자에게 본인 얼굴을 줄 수
// 없어, 표준 아바타를 기본으로 둔다(사용자 수와 무관하게 막히지 않음). 켜도 슬롯이
// 차 있으면 백엔드가 표준으로 폴백한다. deferred(미배포)면 OFF 로 폴백.

/** GET /api/avatars/me/qa-face — 본인 얼굴 사용 여부. deferred 면 false. */
export async function getQaUseOwnFace(): Promise<boolean> {
  try {
    const { data } = await api.get<{ use_own_face: boolean }>(
      "/api/avatars/me/qa-face",
    );
    return data?.use_own_face ?? false;
  } catch (err) {
    if (isDeferredError(err)) return false;
    throw err;
  }
}

/** PATCH /api/avatars/me/qa-face — 옵트인 ON/OFF. deferred 면 입력값 그대로 반환. */
export async function setQaUseOwnFace(useOwnFace: boolean): Promise<boolean> {
  try {
    const { data } = await api.patch<{ use_own_face: boolean }>(
      "/api/avatars/me/qa-face",
      { use_own_face: useOwnFace },
    );
    return data?.use_own_face ?? useOwnFace;
  } catch (err) {
    if (isDeferredError(err)) return useOwnFace;
    throw err;
  }
}

// ── 내 아바타(룩 + 음성 조합) 갤러리 (/api/avatars/me/saved) ───────────────────
//
// 교수자가 "룩 + 음성" 조합을 이름 붙여 저장해 두고, 강의마다 재생성 없이 바로
// 적용하는 라이브러리. 각 항목은 선택적으로 "움직이는 미리보기 영상"(HeyGen 렌더)
// 을 가질 수 있다(Phase 2). 백엔드 미배포(404/405)면 다른 래퍼와 동일하게
// 목록은 빈 배열, 변형(생성/수정/삭제/렌더/적용)은 시뮬레이션 성공으로 폴백한다.

/** 백엔드 SavedAvatar wire(snake). 누락 가능 필드는 ``?`` 로 받아 기본값을 채운다. */
interface SavedAvatarWire {
  id: string;
  name: string;
  look_id: string;
  voice_id?: string | null;
  avatar_scale?: number | null;
  preview_video_url?: string | null;
  preview_status?: SavedAvatarPreviewStatus | null;
  created_at: string;
}

/** wire(snake) → domain 정규화 (toAvatar 패턴). 누락 필드에 기본값을 채운다. */
function toSavedAvatar(w: SavedAvatarWire): SavedAvatar {
  return {
    id: w.id,
    name: w.name,
    look_id: w.look_id,
    voice_id: w.voice_id ?? null,
    avatar_scale: typeof w.avatar_scale === "number" ? w.avatar_scale : 1.0,
    preview_video_url: w.preview_video_url ?? null,
    preview_status: w.preview_status ?? "none",
    created_at: w.created_at,
  };
}

/** GET /api/avatars/me/saved — 저장된 아바타 목록(bare array). deferred 면 []. */
export async function listSavedAvatars(): Promise<SavedAvatar[]> {
  try {
    const { data } = await api.get<SavedAvatarWire[]>("/api/avatars/me/saved");
    return (data ?? []).map(toSavedAvatar);
  } catch (err) {
    if (isDeferredError(err)) return [];
    throw err;
  }
}

/** createSavedAvatar 입력. */
export interface CreateSavedAvatarPayload {
  name: string;
  look_id: string;
  voice_id?: string | null;
  avatar_scale?: number;
  /**
   * 방금 스크립트 테스트에서 렌더한 미리보기 영상. **계약된 POST body 에는 넣지
   * 않는다**(서버는 자체 렌더로 미리보기를 만든다). deferred(미배포) 시뮬레이션에서
   * 만 사용해, 백엔드 없이도 방금 만든 영상을 곧장 ready 카드로 보여 준다.
   */
  preview_video_url?: string | null;
}

/**
 * POST /api/avatars/me/saved — 룩 + 음성 조합을 저장한다.
 * deferred 면 입력 + (있으면) 방금 렌더한 영상으로 시뮬레이션 객체를 반환한다.
 */
export async function createSavedAvatar(
  payload: CreateSavedAvatarPayload,
): Promise<SavedAvatar> {
  // 계약된 body 만 전송한다(preview_video_url 은 제외 — 위 주석 참조).
  const body = {
    name: payload.name,
    look_id: payload.look_id,
    voice_id: payload.voice_id ?? null,
    avatar_scale: payload.avatar_scale ?? 1.0,
  };
  try {
    const { data } = await api.post<SavedAvatarWire>(
      "/api/avatars/me/saved",
      body,
    );
    return toSavedAvatar(data);
  } catch (err) {
    if (isDeferredError(err)) {
      const hasVideo = !!payload.preview_video_url;
      return {
        id: `saved-${Date.now()}`,
        name: payload.name,
        look_id: payload.look_id,
        voice_id: payload.voice_id ?? null,
        avatar_scale: payload.avatar_scale ?? 1.0,
        preview_video_url: payload.preview_video_url ?? null,
        preview_status: hasVideo ? "ready" : "none",
        created_at: new Date().toISOString(),
      };
    }
    throw err;
  }
}

/** updateSavedAvatar 패치 — 이름/음성만 변경 가능(계약). */
export interface SavedAvatarPatch {
  name?: string;
  voice_id?: string | null;
}

/**
 * PATCH /api/avatars/me/saved/{id} — 이름/음성 변경.
 * deferred 면 패치를 반영한 시뮬레이션 객체를 반환한다. 호출자(page)는 낙관적
 * state 를 유지하므로(반환 객체로 전체 덮어쓰지 않음) 누락 필드는 무해하다.
 */
export async function updateSavedAvatar(
  id: string,
  patch: SavedAvatarPatch,
): Promise<SavedAvatar> {
  try {
    const { data } = await api.patch<SavedAvatarWire>(
      `/api/avatars/me/saved/${encodeURIComponent(id)}`,
      patch,
    );
    return toSavedAvatar(data);
  } catch (err) {
    if (isDeferredError(err)) {
      return {
        id,
        name: patch.name ?? "",
        look_id: "",
        voice_id: patch.voice_id ?? null,
        avatar_scale: 1.0,
        preview_video_url: null,
        preview_status: "none",
        created_at: new Date().toISOString(),
      };
    }
    throw err;
  }
}

/** DELETE /api/avatars/me/saved/{id}. deferred/이미 없음(404)은 멱등 성공. */
export async function deleteSavedAvatar(id: string): Promise<{ ok: boolean }> {
  try {
    const { data } = await api.delete<{ ok: boolean }>(
      `/api/avatars/me/saved/${encodeURIComponent(id)}`,
    );
    return { ok: data?.ok ?? true };
  } catch (err) {
    if (isDeferredError(err)) return { ok: true };
    throw err;
  }
}

/**
 * POST /api/avatars/me/saved/{id}/preview — 미리보기 영상 렌더 트리거(또는 캐시).
 * text 를 주면 그 대본을 말한다. 반환 SavedAvatar 의 preview_status 가 보통
 * "processing" 이며, 호출자는 목록 폴링으로 ready 로 갱신한다.
 * deferred 면 백엔드 없이 렌더할 수 없으므로 "processing" 시뮬레이션을 돌려준다.
 */
export async function renderSavedAvatarPreview(
  id: string,
  text?: string | null,
): Promise<SavedAvatar> {
  try {
    const { data } = await api.post<SavedAvatarWire>(
      `/api/avatars/me/saved/${encodeURIComponent(id)}/preview`,
      { text: text ?? null },
    );
    return toSavedAvatar(data);
  } catch (err) {
    if (isDeferredError(err)) {
      return {
        id,
        name: "",
        look_id: "",
        voice_id: null,
        avatar_scale: 1.0,
        preview_video_url: null,
        preview_status: "processing",
        created_at: new Date().toISOString(),
      };
    }
    throw err;
  }
}

/** POST /api/avatars/me/saved/{id}/apply { lecture_id }. deferred 면 시뮬레이션 성공. */
export async function applySavedAvatar(
  id: string,
  lectureId: string,
): Promise<{ ok: boolean }> {
  try {
    const { data } = await api.post<{ ok: boolean }>(
      `/api/avatars/me/saved/${encodeURIComponent(id)}/apply`,
      { lecture_id: lectureId },
    );
    return { ok: data?.ok ?? true };
  } catch (err) {
    if (isDeferredError(err)) return { ok: true };
    throw err;
  }
}

// ── 표준 아바타 등록 (GET/POST/PATCH/DELETE /api/avatars/me/standard) ──────────
//
// 교수자가 HeyGen 웹 스튜디오에서 만든 표준 Video Avatar 의 avatar_id 를 등록해
// 갤러리에서 포토 아바타와 나란히 비교·선택한다. 등록 시 서버가 HeyGen 메타데이터
// (미리보기·성별)를 함께 보관하므로, 목록은 추가 호출 없이 썸네일·샘플 영상을 쓴다.
// 미배포(404/405)면 빈 목록/시뮬레이션으로 폴백해 UI 개발을 막지 않는다.

interface StandardAvatarWire {
  id: string;
  avatar_id: string;
  name?: string | null;
  preview_image_url?: string | null;
  preview_video_url?: string | null;
  gender?: string | null;
}

function toStandardAvatar(w: StandardAvatarWire): StandardAvatar {
  return {
    id: w.id,
    avatar_id: w.avatar_id,
    name: w.name ?? null,
    preview_image_url: w.preview_image_url ?? null,
    preview_video_url: w.preview_video_url ?? null,
    gender: w.gender ?? null,
  };
}

/**
 * GET /api/avatars/heygen-account — HeyGen 계정의 전체 아바타 목록(피커용).
 *
 * 표준 아바타 등록 시 교수자가 avatar_id 를 직접 찾지 않고 이름·썸네일로 골라
 * 선택할 수 있게 한다. 공개 샘플도 포함되므로 UI 는 이름 검색으로 본인 것을 찾는다.
 * deferred(미배포)·MOCK 이면 빈 목록 → 카드가 수동 입력으로 폴백한다.
 */
export async function listHeyGenAccountAvatars(): Promise<Avatar[]> {
  try {
    const { data } = await api.get<AvatarWire[]>("/api/avatars/heygen-account", {
      timeout: _AVATARS_FETCH_TIMEOUT_MS,
    });
    return (data ?? []).map(toAvatar);
  } catch (err) {
    // 공유 HeyGen 계정이 느리거나 매달려도(전역 axios timeout 없음) 카탈로그 한
    // 호출이 페이지를 통째로 멈추지 않게 한다. timeout/미배포는 빈 목록 폴백.
    if (isDeferredError(err) || _isTimeout(err)) return [];
    throw err;
  }
}

// ── HeyGen 아바타 그룹 (Photo Avatar — 웹 "공개 아바타" 캐릭터) ─────────────────
//
// /v2/avatars(=heygen-account)에 없는 Photo Avatar 캐릭터들. 그룹 목록만 먼저 받고,
// 캐릭터를 열 때 그 그룹의 룩을 lazy 로 받는다. deferred/MOCK 이면 빈 목록.

interface HeyGenAvatarGroupWire {
  group_id: string;
  name: string;
  num_looks?: number;
  preview_image_url?: string | null;
}

/** GET /api/avatars/heygen-groups — Photo Avatar 그룹(캐릭터) 목록. */
export async function listHeyGenAvatarGroups(): Promise<HeyGenAvatarGroup[]> {
  try {
    const { data } = await api.get<HeyGenAvatarGroupWire[]>(
      "/api/avatars/heygen-groups",
      { timeout: _AVATARS_FETCH_TIMEOUT_MS },
    );
    return (data ?? []).map((g) => ({
      group_id: g.group_id,
      name: g.name,
      num_looks: g.num_looks ?? 0,
      preview_image_url: g.preview_image_url ?? null,
    }));
  } catch (err) {
    // 둘러보기 페이지는 이 호출과 heygen-account 를 Promise.allSettled 로 함께
    // 기다린다 — 하나라도 매달리면 로딩이 영원히 안 끝난다. timeout 폴백으로 차단.
    if (isDeferredError(err) || _isTimeout(err)) return [];
    throw err;
  }
}

/** GET /api/avatars/heygen-groups/{id}/looks — 한 그룹의 룩 목록(lazy). */
export async function listHeyGenGroupLooks(groupId: string): Promise<Avatar[]> {
  try {
    const { data } = await api.get<AvatarWire[]>(
      `/api/avatars/heygen-groups/${encodeURIComponent(groupId)}/looks`,
      { timeout: _AVATARS_FETCH_TIMEOUT_MS },
    );
    return (data ?? []).map(toAvatar);
  } catch (err) {
    if (isDeferredError(err) || _isTimeout(err)) return [];
    throw err;
  }
}

/** GET /api/avatars/me/standard — 등록한 표준 아바타 목록. deferred 면 빈 목록. */
export async function listMyStandardAvatars(): Promise<StandardAvatar[]> {
  try {
    const { data } = await api.get<StandardAvatarWire[]>("/api/avatars/me/standard");
    return (data ?? []).map(toStandardAvatar);
  } catch (err) {
    if (isDeferredError(err)) return [];
    throw err;
  }
}

/**
 * POST /api/avatars/me/standard — HeyGen avatar_id 를 등록한다.
 * 서버가 계정 아바타 목록에 그 id 가 있는지 검증한다(없으면 404 → throw).
 * 미배포(404 라우트 없음과 구분 불가)일 때를 대비해, 호출자는 에러 detail 을
 * 토스트로 표면화한다(이 함수는 폴백하지 않고 그대로 throw).
 */
export async function registerStandardAvatar(
  avatarId: string,
  name?: string | null,
  meta?: {
    preview_image_url?: string | null;
    preview_video_url?: string | null;
    gender?: string | null;
  } | null,
): Promise<StandardAvatar> {
  const { data } = await api.post<StandardAvatarWire>("/api/avatars/me/standard", {
    avatar_id: avatarId,
    name: name ?? null,
    // 피커에서 고른 경우 메타데이터를 함께 보내 서버 재조회(느림)를 건너뛴다.
    preview_image_url: meta?.preview_image_url ?? null,
    preview_video_url: meta?.preview_video_url ?? null,
    gender: meta?.gender ?? null,
  });
  return toStandardAvatar(data);
}

/** PATCH /api/avatars/me/standard/{id}/name — 표시 이름 변경. deferred 면 멱등 성공. */
export async function renameStandardAvatar(
  recordId: string,
  name: string,
): Promise<{ ok: boolean; name: string | null }> {
  try {
    const { data } = await api.patch<{ ok: boolean; name: string | null }>(
      `/api/avatars/me/standard/${encodeURIComponent(recordId)}/name`,
      { name },
    );
    return { ok: data?.ok ?? true, name: data?.name ?? null };
  } catch (err) {
    if (isDeferredError(err)) return { ok: true, name: name.trim() || null };
    throw err;
  }
}

/** DELETE /api/avatars/me/standard/{id} — 등록 해제. deferred/이미 없음(404)은 멱등 성공. */
export async function deleteStandardAvatar(
  recordId: string,
): Promise<{ ok: boolean }> {
  try {
    const { data } = await api.delete<{ ok: boolean }>(
      `/api/avatars/me/standard/${encodeURIComponent(recordId)}`,
    );
    return { ok: data?.ok ?? true };
  } catch (err) {
    if (isDeferredError(err)) return { ok: true };
    throw err;
  }
}

// ── 아바타 즐겨찾기 (GET/PUT/DELETE /api/avatars/favorites) ─────────────────────
//
// 공개 아바타 브라우저의 별표·"즐겨찾기만 보기". voice 즐겨찾기와 같은 계약.

/** GET /api/avatars/favorites — 즐겨찾기한 avatar_id 목록. deferred 면 빈 목록. */
export async function listFavoriteAvatars(): Promise<string[]> {
  try {
    const { data } = await api.get<string[]>("/api/avatars/favorites", {
      timeout: _AVATARS_FETCH_TIMEOUT_MS,
    });
    return data ?? [];
  } catch (err) {
    // 표준 등록 카드는 이 호출과 heygen-account 를 Promise.all 로 묶어 기다린다 —
    // 하나라도 매달리면 "즐겨찾기 불러오는 중…"이 영원히 안 끝난다. timeout 폴백.
    if (isDeferredError(err) || _isTimeout(err)) return [];
    throw err;
  }
}

/** PUT /api/avatars/{id}/favorite — 즐겨찾기 추가. deferred 면 멱등 성공(무시). */
export async function addFavoriteAvatar(avatarId: string): Promise<void> {
  try {
    await api.put(`/api/avatars/${encodeURIComponent(avatarId)}/favorite`);
  } catch (err) {
    if (isDeferredError(err)) return;
    throw err;
  }
}

/** DELETE /api/avatars/{id}/favorite — 즐겨찾기 해제. deferred 면 멱등 성공(무시). */
export async function removeFavoriteAvatar(avatarId: string): Promise<void> {
  try {
    await api.delete(`/api/avatars/${encodeURIComponent(avatarId)}/favorite`);
  } catch (err) {
    if (isDeferredError(err)) return;
    throw err;
  }
}

export const __fixtures = { FIXTURE_AVATARS };
