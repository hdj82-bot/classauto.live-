"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/professor/shell";
import { useToast } from "@/components/ui/Toast";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useAvatarsI18n } from "@/components/professor/avatars/useAvatarsI18n";
import { useReducedMotion } from "@/components/professor/avatars/useReducedMotion";
import AvatarLibrary from "@/components/professor/avatars/AvatarLibrary";
import SavedAvatarGallery from "@/components/professor/avatars/SavedAvatarGallery";
import AvatarViewerModal from "@/components/professor/avatars/AvatarViewerModal";
import VoiceCloneUploadCard from "@/components/professor/avatars/VoiceCloneUploadCard";
import SampleVoicePicker from "@/components/professor/avatars/SampleVoicePicker";
import AvatarBuilderBar from "@/components/professor/avatars/AvatarBuilderBar";
import CurrentAvatarChip from "@/components/professor/avatars/CurrentAvatarChip";
import AvatarScriptTest from "@/components/professor/avatars/AvatarScriptTest";
import AvatarCreateTypeToggle from "@/components/professor/avatars/AvatarCreateTypeToggle";
import OwnPhotoUploadCard from "@/components/professor/avatars/OwnPhotoUploadCard";
import StandardAvatarRegisterCard from "@/components/professor/avatars/StandardAvatarRegisterCard";
import { selectLook } from "@/components/professor/avatars/onboarding/photoAvatarApi";
import {
  applyAvatarToLecture,
  applySavedAvatar,
  applyVoiceToLecture,
  createSavedAvatar,
  deleteMyLook,
  deleteMyVoice,
  deleteSavedAvatar,
  deleteStandardAvatar,
  getLectureAvatar,
  getLectureTitle,
  getMyVoice,
  getRecentAvatarId,
  saveLectureAvatarPreview,
  listAvatars,
  listMyLooks,
  listMyStandardAvatars,
  listSavedAvatars,
  renameAvatarForLecture,
  renameMyLook,
  renameStandardAvatar,
  renderSavedAvatarPreview,
  requestVoiceScript,
  setRecentAvatar,
  updateSavedAvatar,
  uploadOwnFaceLook,
  uploadVoiceSample,
} from "@/components/professor/avatars/avatarsApi";
import type {
  LectureAvatarInfo,
  MyLook,
  ScriptLanguage,
} from "@/components/professor/avatars/avatarsApi";
import { listVoiceOptions, previewVoice } from "@/components/professor/avatars/voicesApi";
import type {
  Avatar,
  AvatarKind,
  SavedAvatar,
  StandardAvatar,
  VoiceClone,
  VoiceScriptResult,
} from "@/components/professor/avatars/avatarsTypes";
import type { VoiceOption } from "@/components/professor/avatars/voicePresets";

/**
 * /professor/avatars — 강의 아바타 고르기 (HeyGen 스타일 대수술).
 *
 * docs/planning/05-instructor-pages.md (아바타 선택) + 12-self-avatar-onboarding.md
 * + design-system v2 (라이트 베이지 + 골드). Q&A 아바타 = ①룩 + ②목소리:
 *  ① 룩 — 저장된 아바타·룩 라이브러리(AvatarLibrary)에서 고르거나, "내 사진으로
 *     아바타 만들기"(PhotoAvatarStudioCard)로 새로 생성한다.
 *  ② 목소리 — 본인 목소리(VoiceCloneUploadCard) 또는 샘플 보이스(SampleVoicePicker)
 *     중 하나를 고른다. 강의 진행 목소리와 Q&A 목소리를 일치시키기 위해 음성 선택을
 *     스튜디오에서 이 페이지로 옮겼다(스튜디오엔 발화 속도만 남김).
 *
 * 우측 상단 "룩과 목소리 아바타 제작" 이 ①선택 룩(avatar_id) + ②선택 목소리(voice_id)
 * 를 현재 강의에 함께 적용하고 studio 로 복귀한다(렌더 시 HeyGen 이 룩+음성 결합).
 *
 * 백엔드 계약이 미배포면 avatarsApi/photoAvatarApi 가 fixture/mock 으로 폴백한다.
 * ``?lecture={id}`` 진입 시 선택/이름 변경이 해당 강의에 저장되고 studio 로
 * 복귀하며, 그 강의 제목이 녹음 대본의 주제로 쓰인다.
 */
export default function AvatarsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useAvatarsI18n();
  const { toast } = useToast();
  const reducedMotion = useReducedMotion();

  const lectureId = searchParams?.get("lecture") ?? null;
  const renameEnabled = !!lectureId;

  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [loading, setLoading] = useState(true);
  const [deferred, setDeferred] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  // 큰 보기(뷰어) 모달 대상 id. 카드/최근 박스 클릭 시 연다.
  const [viewerId, setViewerId] = useState<string | null>(null);

  // "아바타 제작에 사용" 으로 고른 단일 음성 id. null = 아무것도 선택 안 함.
  // 본인 목소리(VoiceCloneUploadCard)와 샘플 보이스(SampleVoicePicker)가 이 한 값을
  // 공유해 상호 배타가 된다(둘 다 동시 활성 불가). 선택했을 때만 "제작" 시 PATCH.
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);

  // "룩과 목소리 아바타 제작" 작업대 — 누르면 열려 그 자리에서 아바타를 렌더한다.
  //  builderOpen: 작업대 노출 여부. renderNonce: 제작 버튼을 누를 때마다 증가해 렌더 트리거.
  const [builderOpen, setBuilderOpen] = useState(false);
  const [renderNonce, setRenderNonce] = useState(0);

  // 저장된 본인 룩(라이브러리) + 가장 최근 선택(서버 영속) — 재방문 시 재생성 없이
  // 바로 고르도록 복원한다.
  const [looks, setLooks] = useState<MyLook[]>([]);
  const [recentId, setRecentId] = useState<string | null>(null);

  // 내 아바타(룩 + 음성 조합) 갤러리 — 저장/적용/삭제/이름변경 + 미리보기 영상.
  const [savedAvatars, setSavedAvatars] = useState<SavedAvatar[]>([]);
  const [applyingSavedId, setApplyingSavedId] = useState<string | null>(null);
  const [savingAvatar, setSavingAvatar] = useState(false);

  // 등록한 표준 아바타(HeyGen 웹 스튜디오 Video Avatar) — 라이브러리에 포토 아바타와
  // 나란히 노출하고 강의에 적용할 수 있다.
  const [standardAvatars, setStandardAvatars] = useState<StandardAvatar[]>([]);

  // 아바타 제작 방식 — "photo"(교수자 본인 아바타) | "standard"(타인 아바타). 기본 photo.
  // 갤러리·라이브러리도 이 값으로 본인(업로드) vs 타인(HeyGen)을 나눠 보여 준다.
  const [createType, setCreateType] = useState<AvatarKind>("photo");

  // 본인 사진 직접 업로드(교수자 본인 얼굴 룩) 진행 상태.
  const [uploadingOwnPhoto, setUploadingOwnPhoto] = useState(false);

  // 녹음 대본 주제로 쓸 현재 강의 제목(없으면 null → 일반 학술 대본).
  const [lectureTitle, setLectureTitle] = useState<string | null>(null);

  // 현재 강의에 적용돼 있는 아바타(빌더 바 우측 "현재 지정된 아바타" 표시용).
  // 저장된 미리보기 URL 우선, 없으면 목록에서 avatar_id 로 해석해 폴백한다.
  const [currentLectureAvatar, setCurrentLectureAvatar] =
    useState<LectureAvatarInfo | null>(null);

  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(true);

  // 본인 음성(클론) 상태.
  const [voiceClone, setVoiceClone] = useState<VoiceClone>({ status: "none" });
  const [voiceUploading, setVoiceUploading] = useState(false);

  // 음성 카탈로그를 다시 불러온다 — 본인 음성 생성/삭제 후 목록 갱신용.
  const reloadVoices = useCallback(async () => {
    try {
      const { voices: list } = await listVoiceOptions();
      setVoices(list);
    } catch {
      /* 실패 시 기존 목록 유지 */
    }
  }, []);

  // 아바타·룩 목록을 다시 불러온다(스피너 없이) — 본인 룩 확정 후 갤러리/라이브러리 갱신용.
  const refreshAvatars = useCallback(async () => {
    try {
      const { avatars: list, deferred: isDeferred } = await listAvatars();
      setAvatars(list);
      setDeferred(isDeferred);
    } catch {
      /* 실패 시 기존 목록 유지 */
    }
    try {
      setLooks(await listMyLooks());
    } catch {
      /* 실패 시 기존 룩 유지 */
    }
    try {
      setStandardAvatars(await listMyStandardAvatars());
    } catch {
      /* 실패 시 기존 표준 아바타 유지 */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { avatars: list, deferred: isDeferred } = await listAvatars();
        if (cancelled) return;
        setAvatars(list);
        setDeferred(isDeferred);
      } catch {
        /* 실패 시 라이브러리는 비고, 위쪽 "내 사진으로 아바타 만들기"부터 시작한다. */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 저장된 본인 룩 + 가장 최근 선택 — 라이브러리/최근 박스 복원용(스피너 없이).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listMyLooks();
        if (!cancelled) setLooks(list);
      } catch {
        /* 미배포/실패 시 빈 목록 유지 */
      }
      try {
        const list = await listMyStandardAvatars();
        if (!cancelled) setStandardAvatars(list);
      } catch {
        /* 미배포/실패 시 빈 목록 유지 */
      }
      try {
        const rid = await getRecentAvatarId();
        if (!cancelled) setRecentId(rid);
      } catch {
        /* 미배포/실패 시 null 유지 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 저장된 내 아바타(룩 + 음성 조합) 갤러리 — 미배포/실패 시 빈 목록 유지.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listSavedAvatars();
        if (!cancelled) setSavedAvatars(list);
      } catch {
        /* 미배포/실패 시 빈 목록 유지 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 처리 중(렌더) 미리보기가 하나라도 있으면 목록을 폴링해 ready 로 갱신한다.
  // 의존성은 "처리 중 id 집합" 키 — 집합이 그대로면 effect 가 재실행되지 않아
  // 인터벌이 새로 만들어지지 않는다(폴링 1개 유지). ready/failed 로 바뀌면 키가
  // 변해 재실행되고, 더 처리 중인 게 없으면 정리만 하고 끝난다. 목록은 id 로
  // 병합해 낙관적 항목(deferred 저장분)을 덮어쓰지 않는다.
  const processingKey = savedAvatars
    .filter((a) => a.preview_status === "processing")
    .map((a) => a.id)
    .sort()
    .join(",");
  useEffect(() => {
    if (!processingKey) return;
    let attempts = 0;
    let cancelled = false;
    const id = setInterval(() => {
      if (attempts >= 30) {
        clearInterval(id);
        return;
      }
      attempts += 1;
      void (async () => {
        try {
          const list = await listSavedAvatars();
          if (cancelled || list.length === 0) return;
          setSavedAvatars((prev) =>
            prev.map((a) => list.find((l) => l.id === a.id) ?? a),
          );
        } catch {
          /* 폴링 실패는 다음 주기에 재시도 */
        }
      })();
    }, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [processingKey]);

  // 강의 제목 조회 — 녹음 대본 주제용. 실패/미배포면 null 유지.
  useEffect(() => {
    if (!lectureId) {
      setLectureTitle(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const title = await getLectureTitle(lectureId);
      if (!cancelled) setLectureTitle(title);
    })();
    return () => {
      cancelled = true;
    };
  }, [lectureId]);

  // 현재 강의에 지정된 아바타 — "현재 지정된 아바타" 칩 표시용. 미배포/실패면 null.
  useEffect(() => {
    if (!lectureId) {
      setCurrentLectureAvatar(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const info = await getLectureAvatar(lectureId);
      if (!cancelled) setCurrentLectureAvatar(info);
    })();
    return () => {
      cancelled = true;
    };
  }, [lectureId]);

  // 음성 카탈로그 (studio 와 동일한 /api/voices). 실패 시 합성 폴백.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { voices: list } = await listVoiceOptions();
        if (!cancelled) setVoices(list);
      } finally {
        if (!cancelled) setVoicesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 본인 음성(클론) 상태 조회.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const v = await getMyVoice();
        if (!cancelled) setVoiceClone(v);
      } catch {
        /* 미배포/실패 시 none 유지 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 라이브러리 = 교수자가 만든 본인 아바타(talking photo) + ready 룩. 룩은 렌더용
  // avatar_id 로 그대로 통용되므로(video.py) 동일 Avatar shape 로 정규화한다.
  const libraryItems = useMemo<Avatar[]>(() => {
    // 본인 Talking Photo(GET /api/avatars 의 is_custom 항목)도 포토 아바타로 태그.
    const customAvatars: Avatar[] = avatars
      .filter((a) => a.is_custom)
      .map((a) => ({ ...a, kind: "photo" as const }));
    // 라이브러리는 "확정(saved)된" 룩만 노출한다 — 온보딩에서 생성한 모든 후보가
    // 자동으로 라이브러리에 쌓이지 않게(사용자 결정 2026-06-02).
    const lookAvatars: Avatar[] = looks
      .filter((l) => l.status === "ready" && l.saved)
      .map((l) => ({
        id: l.id,
        // 영어 prompt 대신 사용자 지정 이름. 없으면 폴백 라벨(연필로 직접 붙인다).
        name: l.name?.trim() || t("lookUntitled"),
        preview_image_url: l.preview_image_url,
        preview_video_url: null,
        is_custom: true,
        isLook: true,
        kind: "photo" as const,
        status: "ready" as const,
      }));
    // 등록한 표준 Video Avatar — 렌더용 id 는 heygen avatar_id, rename/delete 는 recordId.
    const standardItems: Avatar[] = standardAvatars.map((s) => ({
      id: s.avatar_id,
      recordId: s.id,
      name: s.name?.trim() || t("standardUntitled"),
      preview_image_url: s.preview_image_url,
      preview_video_url: s.preview_video_url,
      gender: s.gender,
      is_custom: true,
      isLook: true,
      kind: "standard" as const,
      status: "ready" as const,
    }));
    // 같은 id 중복 제거(본인 아바타와 룩이 우연히 겹칠 일은 없으나 방어적으로).
    const seen = new Set<string>();
    return [...customAvatars, ...lookAvatars, ...standardItems].filter((a) =>
      seen.has(a.id) ? false : (seen.add(a.id), true),
    );
  }, [avatars, looks, standardAvatars, t]);

  // 선택/최근 id 를 해석한다. 라이브러리(kind·preview 가 정규화된 항목)를 먼저 보고,
  // 없으면 원본 아바타 목록으로 폴백한다 — 이래야 포토/표준 배지와 작업대 분기가
  // 선택·최근·뷰어에서도 일관되게 동작한다(원본 목록은 kind 미태깅).
  const resolveAvatar = useCallback(
    (id: string | null): Avatar | null => {
      if (!id) return null;
      return (
        libraryItems.find((a) => a.id === id) ??
        avatars.find((a) => a.id === id) ??
        null
      );
    },
    [avatars, libraryItems],
  );

  const recentAvatar = useMemo(
    () => resolveAvatar(recentId),
    [resolveAvatar, recentId],
  );

  // 제작 방식 토글로 라이브러리·갤러리를 본인 vs 타인으로 나눈다.
  //  - 교수자 본인 아바타(photo): 업로드 사진으로 만든 룩·본인 아바타(kind "photo").
  //  - 타인 아바타(standard): HeyGen 표준 아바타(kind "standard").
  const isStandardMode = createType === "standard";

  const visibleLibraryItems = useMemo(
    () =>
      libraryItems.filter((a) =>
        isStandardMode ? a.kind === "standard" : a.kind === "photo",
      ),
    [libraryItems, isStandardMode],
  );

  // 저장된 아바타(룩+음성)는 look_id 가 등록 표준 아바타면 타인, 아니면 본인으로 본다.
  const visibleSavedAvatars = useMemo(
    () =>
      savedAvatars.filter((a) => {
        const isStandard = standardAvatars.some(
          (s) => s.avatar_id === a.look_id,
        );
        return isStandardMode ? isStandard : !isStandard;
      }),
    [savedAvatars, standardAvatars, isStandardMode],
  );

  // 최근 선택 박스도 현재 모드에 해당할 때만 노출(다른 모드의 항목 숨김).
  const visibleRecent = useMemo(() => {
    if (!recentAvatar) return null;
    const matches = isStandardMode
      ? recentAvatar.kind === "standard"
      : recentAvatar.kind === "photo";
    return matches ? recentAvatar : null;
  }, [recentAvatar, isStandardMode]);

  // 큰 보기(뷰어) 대상 — 목록이 갱신되면(이름 변경 등) 자동으로 최신 값을 반영한다.
  const viewerAvatar = useMemo(
    () => resolveAvatar(viewerId),
    [resolveAvatar, viewerId],
  );

  // 스크립트 테스트 대상 — 현재 선택한 룩 + 음성. 본인(사진) 아바타일 때만 렌더 가능.
  const selectedAvatar = useMemo(
    () => resolveAvatar(selectedId),
    [resolveAvatar, selectedId],
  );
  const selectedVoiceName = useMemo(
    () => voices.find((v) => v.id === selectedVoiceId)?.name ?? null,
    [voices, selectedVoiceId],
  );

  // "현재 지정된 아바타" 표시 데이터 — 강의에 저장된 미리보기(비정규화)를 우선 쓰고,
  // 없으면(구 강의 등) avatar_id 를 로드된 목록에서 해석해 폴백한다. 목록이 늦게
  // 로드돼도 resolveAvatar 의존으로 자동 갱신된다. avatar_id 가 없으면 표시 안 함.
  const currentAvatarDisplay = useMemo(() => {
    const id = currentLectureAvatar?.avatar_id;
    if (!id) return null;
    const resolved = resolveAvatar(id);
    return {
      name:
        currentLectureAvatar?.avatar_name ??
        resolved?.name ??
        t("currentAvatarFallbackName"),
      imageUrl:
        currentLectureAvatar?.avatar_preview_url ??
        resolved?.preview_image_url ??
        null,
      videoUrl:
        currentLectureAvatar?.avatar_preview_video_url ??
        resolved?.preview_video_url ??
        null,
    };
  }, [currentLectureAvatar, resolveAvatar, t]);

  // 스크립트 테스트 렌더 직전 — 선택한 본인 룩(MyLook)을 기본 룩으로 지정해
  // me/preview 가 그 룩을 렌더하도록 맞춘다. 이미 기본이거나 본인 룩이 아니면 no-op.
  const handlePrepareRender = useCallback(async () => {
    if (!selectedId) return;
    const look = looks.find((l) => l.id === selectedId);
    if (!look || look.is_default) return;
    try {
      await selectLook(selectedId);
      setLooks((prev) =>
        prev.map((l) => ({ ...l, is_default: l.id === selectedId })),
      );
    } catch {
      /* 기본 룩 지정 실패는 무시 — 렌더가 기존 기본 룩으로 진행된다. */
    }
  }, [selectedId, looks]);

  // 아바타/룩 선택 — 재생성 없이 즉시. 최근 선택을 서버에 영속화한다(실패는 무시).
  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    setRecentId(id);
    void setRecentAvatar(id).catch(() => {});
  }, []);

  // browse 페이지에서 표준 아바타 등록 후 복귀 — ?selectStandard=<avatar_id> 가 있으면
  // 그 아바타를 제작용 룩으로 선택하고(상단 "룩"), 파라미터를 정리한다.
  //
  // Next 라우터 캐시로 복귀하면 standardAvatars 가 stale 일 수 있어, "목록에 있으면
  // 선택"하는 조건부 방식은 타이밍에 취약했다(2026-06-09 사용자: 등록해도 룩 미선택).
  // 그래서 sel 이 보이면 조건 없이 **즉시 selectedId 로 지정**하고(룩 박스는 목록이
  // 로드되면 resolve), 동시에 목록을 새로고침해 라이브러리에 포함시킨 뒤 파라미터를
  // 정리한다. ref 로 sel 당 1회만 실행한다.
  const selStandardDoneRef = useRef<string | null>(null);
  useEffect(() => {
    const sel = searchParams?.get("selectStandard");
    if (!sel || selStandardDoneRef.current === sel) return;
    selStandardDoneRef.current = sel;
    handleSelect(sel);
    void refreshAvatars();
    router.replace(`/professor/avatars${lectureId ? `?lecture=${lectureId}` : ""}`);
  }, [searchParams, handleSelect, refreshAvatars, router, lectureId]);

  // 음성 라이브러리('음성 고르기')에서 '이 음성으로 선택' 후 복귀 — ?voice=<voice_id>
  // 가 있으면 그 음성을 제작용 샘플 음성으로 지정하고(상호 배타), 목록을 새로고침해
  // (라이브러리에서 새로 추가된 음성 포함) 카드에 반영한 뒤 파라미터를 정리한다.
  const voiceSelDoneRef = useRef<string | null>(null);
  useEffect(() => {
    const v = searchParams?.get("voice");
    if (!v || voiceSelDoneRef.current === v) return;
    voiceSelDoneRef.current = v;
    setSelectedVoiceId(v);
    void reloadVoices();
    toast(t("voiceUseForBuildDone"), "success");
    router.replace(`/professor/avatars${lectureId ? `?lecture=${lectureId}` : ""}`);
  }, [searchParams, reloadVoices, router, lectureId, toast, t]);

  // 카드/최근 박스 클릭 — 큰 보기(뷰어)를 열고, 동시에 선택(최근/미리보기 반영)한다.
  const handleOpen = useCallback(
    (avatar: Avatar) => {
      handleSelect(avatar.id);
      setViewerId(avatar.id);
    },
    [handleSelect],
  );

  // 표준 아바타 등록 직후 — 라이브러리를 갱신하고 그 아바타를 제작용 룩으로 바로
  // 선택한다(상단 "룩" 박스에 표시). 등록만 하고 끝나 "변화가 없어 보이던" 문제 해소:
  // 등록 → 룩 확정 → 음성 선택 후 "룩과 목소리 아바타 제작"으로 합성까지 잇는다.
  const handleStandardRegistered = useCallback(
    async (avatar: StandardAvatar) => {
      await refreshAvatars(); // standardAvatars 갱신 → libraryItems 에 새 아바타 포함.
      handleSelect(avatar.avatar_id); // 렌더용 id = heygen avatar_id → 상단 "룩"에 표시.
      setBuilderOpen(false);
    },
    [refreshAvatars, handleSelect],
  );

  // "아바타 제작에 사용" — 최근 선택 룩을 제작용 룩으로 확정한다(상단 "룩" 박스에 표시).
  // 강의에 바로 적용하지 않는다 — 음성과 함께 "룩과 목소리 아바타 제작"에서 적용한다.
  const handleUseForBuild = useCallback(
    (id: string) => {
      handleSelect(id);
      setBuilderOpen(false); // 룩이 바뀌었으니 작업대는 다시 "제작"으로 연다.
      toast(t("useForBuildDone"), "success");
    },
    [handleSelect, toast, t],
  );

  // 본인이 준비한 사진을 라이브러리 룩으로 직접 업로드(AI 룩 생성 대체). 성공 시
  // 라이브러리에 즉시 반영하고 그 룩을 제작용 룩(상단 "룩")으로 선택한다.
  const handleUploadOwnPhoto = useCallback(
    async (file: File) => {
      setUploadingOwnPhoto(true);
      try {
        const look = await uploadOwnFaceLook(file);
        setLooks((prev) => [look, ...prev.filter((l) => l.id !== look.id)]);
        handleSelect(look.id);
        setBuilderOpen(false);
        toast(t("libraryUploadSuccess"), "success");
      } catch {
        toast(t("libraryUploadError"), "error");
      } finally {
        setUploadingOwnPhoto(false);
      }
    },
    [handleSelect, toast, t],
  );

  // 룩/표준 아바타 이름 저장(연필) — 낙관적으로 목록의 name 을 갱신하고 서버에 반영.
  // 전달되는 id 는 렌더용 id(룩 id 또는 표준 avatar_id)이므로, 표준이면 그 항목의
  // 등록 레코드 id(recordId)로 rename API 를 호출한다.
  const handleRenameLook = useCallback(
    async (itemId: string, name: string) => {
      const next = name.trim();
      const std = standardAvatars.find((s) => s.avatar_id === itemId);
      if (std) {
        setStandardAvatars((prev) =>
          prev.map((s) =>
            s.id === std.id ? { ...s, name: next || null } : s,
          ),
        );
        try {
          await renameStandardAvatar(std.id, next);
          toast(t("lookRenameSuccess"), "success");
        } catch {
          toast(t("lookRenameError"), "error");
          await refreshAvatars();
        }
        return;
      }
      setLooks((prev) =>
        prev.map((l) => (l.id === itemId ? { ...l, name: next || null } : l)),
      );
      try {
        await renameMyLook(itemId, next);
        toast(t("lookRenameSuccess"), "success");
      } catch {
        toast(t("lookRenameError"), "error");
        // 실패 시 서버 기준으로 되돌린다.
        await refreshAvatars();
      }
    },
    [toast, t, refreshAvatars, standardAvatars],
  );

  // 본인 클론 음성 id (있으면). 샘플 목록에서 제외하고, "내 목소리" 토글의 값이 된다.
  const ownVoiceId = voiceClone.voice_id ?? null;
  const ownVoiceSelected = !!ownVoiceId && selectedVoiceId === ownVoiceId;

  // 샘플 보이스 토글 — 같은 음성을 다시 누르면 해제. 본인 목소리 선택은 자동 해제된다
  // (단일 selectedVoiceId 라 다른 값으로 덮어써짐). 선택(켤) 때 룩과 동일한 배너 안내.
  const handleToggleSampleVoice = useCallback(
    (id: string) => {
      const next = selectedVoiceId === id ? null : id;
      setSelectedVoiceId(next);
      if (next) toast(t("voiceUseForBuildDone"), "success");
    },
    [selectedVoiceId, toast, t],
  );

  // "내 목소리" 토글 — 켜면 selectedVoiceId = 본인 음성, 다시 누르면 해제(null).
  // 샘플이 켜져 있었으면 본인 음성으로 덮어써져 자동 해제된다.
  const handleToggleOwnVoice = useCallback(() => {
    if (!ownVoiceId) return;
    const next = selectedVoiceId === ownVoiceId ? null : ownVoiceId;
    setSelectedVoiceId(next);
    if (next) toast(t("voiceUseForBuildDone"), "success");
  }, [ownVoiceId, selectedVoiceId, toast, t]);

  // 지정한 룩(아바타) + 선택한 목소리를 현재 강의에 함께 적용해 Q&A 아바타를
  // "제작"한다(재생성 없음 — 렌더 시 HeyGen 이 룩+음성 결합). 헤더·최근 박스가 공유.
  const doApply = useCallback(
    async (id: string | null) => {
      if (!lectureId || !id) return;
      setApplying(true);
      try {
        // 적용 시점에 알고 있는 미리보기 URL 도 함께 저장해, studio 우측 패널·
        // "현재 지정된 아바타"가 썸네일(클릭 시 영상)을 보여 줄 수 있게 한다.
        const applied = resolveAvatar(id);
        await applyAvatarToLecture(lectureId, id, {
          imageUrl: applied?.preview_image_url ?? null,
          videoUrl: applied?.preview_video_url ?? null,
        });
        // 음성을 골랐을 때만 voice_id 를 덮어쓴다(미선택 시 기존 강의 음성 보존).
        if (selectedVoiceId) await applyVoiceToLecture(lectureId, selectedVoiceId);
        toast(t("applySuccess"), "success");
        router.push(`/professor/studio/${lectureId}`);
      } catch {
        toast(t("applyError"), "error");
      } finally {
        setApplying(false);
      }
    },
    [lectureId, router, toast, t, selectedVoiceId, resolveAvatar],
  );

  const handleApply = useCallback(
    () => doApply(selectedId),
    [doApply, selectedId],
  );

  // ── 내 아바타(룩 + 음성 조합) 갤러리 핸들러 ─────────────────────────────────

  // look_id → 룩 썸네일(저장된 룩 → 등록 표준 아바타 → 본인 talking photo 순).
  // 표준 아바타는 look_id 가 heygen avatar_id 라 standardAvatars 에서 매칭해야 한다
  // (이게 빠져 있어 표준 아바타 카드가 이니셜 'S' 로만 보였다). 없으면 이니셜 폴백.
  const resolveLookImage = useCallback(
    (lookId: string): string | null =>
      looks.find((l) => l.id === lookId)?.preview_image_url ??
      standardAvatars.find((s) => s.avatar_id === lookId)?.preview_image_url ??
      avatars.find((a) => a.id === lookId)?.preview_image_url ??
      null,
    [looks, standardAvatars, avatars],
  );

  // voice_id → 표시 이름. 본인 클론이면 그 이름(없으면 "내 목소리"), 아니면 카탈로그.
  const resolveSavedVoiceName = useCallback(
    (voiceId: string | null): string | null => {
      if (!voiceId) return null;
      if (ownVoiceId && voiceId === ownVoiceId)
        return voiceClone.name ?? t("voiceMyBadge");
      return voices.find((v) => v.id === voiceId)?.name ?? null;
    },
    [ownVoiceId, voiceClone.name, voices, t],
  );

  // "이 아바타 저장"(스크립트 테스트) — 현재 룩 + 선택 음성 조합을 갤러리에 저장.
  // 방금 렌더한 영상(previewVideoUrl)이 있으면 함께 넘겨 카드에서 바로 재생되게 한다.
  const handleSaveAvatar = useCallback(
    async (previewVideoUrl: string | null) => {
      const look = selectedAvatar;
      if (!look) return;
      setSavingAvatar(true);
      try {
        const created = await createSavedAvatar({
          name: look.name,
          look_id: look.id,
          voice_id: selectedVoiceId,
          preview_video_url: previewVideoUrl,
        });
        // 낙관적으로 맨 앞에 추가(같은 id 중복 방지). deferred 면 시뮬레이션 객체.
        setSavedAvatars((prev) => [
          created,
          ...prev.filter((a) => a.id !== created.id),
        ]);
        toast(t("saveAvatarSuccess"), "success");
      } catch {
        toast(t("saveAvatarError"), "error");
      } finally {
        setSavingAvatar(false);
      }
    },
    [selectedAvatar, selectedVoiceId, toast, t],
  );

  // 저장된 아바타를 현재 강의에 적용(룩 + 음성 한 번에) 후 studio 로 복귀.
  const handleApplySaved = useCallback(
    async (id: string) => {
      if (!lectureId) return;
      setApplyingSavedId(id);
      try {
        await applySavedAvatar(id, lectureId);
        // 적용 직후 표시용 미리보기(룩 썸네일 + ready 루프 영상)를 강의에 저장한다.
        // applySavedAvatar 가 서버에서 avatar_id 를 정하므로 미리보기만 비정규화한다.
        const saved = savedAvatars.find((a) => a.id === id);
        if (saved) {
          await saveLectureAvatarPreview(lectureId, {
            imageUrl: resolveLookImage(saved.look_id),
            videoUrl:
              saved.preview_status === "ready" ? saved.preview_video_url : null,
          });
        }
        toast(t("applySuccess"), "success");
        router.push(`/professor/studio/${lectureId}`);
      } catch {
        toast(t("applyError"), "error");
      } finally {
        setApplyingSavedId(null);
      }
    },
    [lectureId, router, toast, t, savedAvatars, resolveLookImage],
  );

  // 삭제(낙관적). 실패 시 서버 기준으로 목록을 다시 맞춘다.
  const handleDeleteSaved = useCallback(
    async (id: string) => {
      if (
        typeof window !== "undefined" &&
        !window.confirm(t("deleteConfirm"))
      ) {
        return;
      }
      setSavedAvatars((cur) => cur.filter((a) => a.id !== id));
      try {
        await deleteSavedAvatar(id);
        toast(t("deleteAvatarSuccess"), "success");
      } catch {
        toast(t("deleteAvatarError"), "error");
        try {
          setSavedAvatars(await listSavedAvatars());
        } catch {
          /* 재조회 실패는 무시 */
        }
      }
    },
    [toast, t],
  );

  // 이름 변경(낙관적). 실패 시 서버 기준으로 되돌린다.
  const handleRenameSaved = useCallback(
    async (id: string, name: string) => {
      const next = name.trim();
      if (!next) return;
      setSavedAvatars((cur) =>
        cur.map((a) => (a.id === id ? { ...a, name: next } : a)),
      );
      try {
        await updateSavedAvatar(id, { name: next });
        toast(t("renameSuccess"), "success");
      } catch {
        toast(t("renameError"), "error");
        try {
          setSavedAvatars(await listSavedAvatars());
        } catch {
          /* 재조회 실패는 무시 */
        }
      }
    },
    [toast, t],
  );

  // 미리보기 영상 렌더 트리거 — 즉시 processing 표시 후 응답 상태 반영(폴링은 effect).
  const handlePreviewSaved = useCallback(
    async (id: string) => {
      setSavedAvatars((cur) =>
        cur.map((a) =>
          a.id === id ? { ...a, preview_status: "processing" } : a,
        ),
      );
      try {
        const res = await renderSavedAvatarPreview(id);
        setSavedAvatars((cur) =>
          cur.map((a) =>
            a.id === id
              ? {
                  ...a,
                  preview_status: res.preview_status,
                  preview_video_url:
                    res.preview_video_url ?? a.preview_video_url,
                }
              : a,
          ),
        );
      } catch {
        setSavedAvatars((cur) =>
          cur.map((a) =>
            a.id === id ? { ...a, preview_status: "failed" } : a,
          ),
        );
        toast(t("previewError"), "error");
      }
    },
    [toast, t],
  );

  // "룩과 목소리 아바타 제작" — 본인(사진) 아바타는 아래 작업대를 열어 그 자리에서
  // 렌더·성능 확인 후 적용한다. 표준 HeyGen 아바타는 인라인 렌더 대상이 아니므로
  // (Talking Photo 없음) 바로 강의에 적용한다.
  const handleOpenBuilder = useCallback(() => {
    if (!selectedId || !selectedVoiceId) return;
    // 인라인 렌더 작업대 — 포토 아바타(talking_photo)·표준 아바타(avatar_id) 모두
    // me/preview 로 그 자리에서 합성해 확인한다. 그 외(큐레이션 기본 아바타 등)는
    // 인라인 렌더 대상이 아니라 바로 강의에 적용한다.
    if (selectedAvatar?.is_custom) {
      setBuilderOpen(true);
      setRenderNonce((n) => n + 1);
    } else {
      handleApply();
    }
  }, [selectedId, selectedVoiceId, selectedAvatar, handleApply]);

  // 라이브러리 항목 삭제 — ⋮ 메뉴. 가벼운 confirm 후 낙관적으로 제거하고 서버에서
  // 삭제한다. 삭제한 항목이 현재 선택/최근이었다면 그 상태도 비운다.
  const handleLibraryDelete = useCallback(
    async (id: string) => {
      if (
        typeof window !== "undefined" &&
        !window.confirm(t("cardDeleteConfirm"))
      ) {
        return;
      }
      // 낙관적 제거 — 룩(라이브러리 본체)·본인 아바타·표준 아바타에서 동시에 뺀다.
      const std = standardAvatars.find((s) => s.avatar_id === id);
      setLooks((prev) => prev.filter((l) => l.id !== id));
      setStandardAvatars((prev) => prev.filter((s) => s.avatar_id !== id));
      setAvatars((prev) => prev.filter((a) => !(a.is_custom && a.id === id)));
      setSelectedId((prev) => (prev === id ? null : prev));
      setRecentId((prev) => (prev === id ? null : prev));
      try {
        // 표준 아바타는 등록 레코드 id(recordId)로, 룩은 그 id 로 삭제한다.
        if (std) await deleteStandardAvatar(std.id);
        else await deleteMyLook(id);
        toast(t("cardDeleteSuccess"), "success");
      } catch {
        toast(t("cardDeleteError"), "error");
      } finally {
        // 서버 기준으로 목록을 다시 맞춘다(낙관적 제거 보정).
        await refreshAvatars();
      }
    },
    [t, toast, refreshAvatars, standardAvatars],
  );

  const handleRename = useCallback(
    async (avatarId: string, name: string) => {
      setAvatars((prev) =>
        prev.map((a) => (a.id === avatarId ? { ...a, name } : a)),
      );
      if (!lectureId) return;
      try {
        await renameAvatarForLecture(lectureId, name);
        toast(t("renameSuccess"), "success");
      } catch {
        toast(t("renameError"), "error");
      }
    },
    [lectureId, toast, t],
  );

  // 녹음 대본 요청 — 현재 강의 제목을 주제로, 선택 언어에 맞춘 학술 대본을 받는다.
  const handleRequestScript = useCallback(
    async (language: ScriptLanguage): Promise<VoiceScriptResult | null> => {
      try {
        return await requestVoiceScript(lectureTitle, language);
      } catch {
        return null;
      }
    },
    [lectureTitle],
  );

  const handleVoiceUpload = useCallback(
    async (file: File) => {
      setVoiceUploading(true);
      try {
        const v = await uploadVoiceSample(file);
        setVoiceClone(v);
        if (v.status === "ready") {
          toast(t("voiceUploadStatusReady"), "success");
          // 새 본인 음성이 /api/voices 계정 보이스로 노출되도록 목록 갱신.
          await reloadVoices();
        } else if (v.status === "failed") {
          toast(v.message || t("voiceUploadStatusFailed"), "error");
        }
      } catch {
        setVoiceClone({ status: "failed" });
        toast(t("voiceUploadError"), "error");
      } finally {
        setVoiceUploading(false);
      }
    },
    [toast, t, reloadVoices],
  );

  // 본인 클론 음성 미리듣기 — 서버 TTS 로 샘플 문장을 합성해 Blob 으로 돌려준다.
  const handleVoicePreview = useCallback(async (): Promise<Blob | null> => {
    if (!voiceClone.voice_id) return null;
    try {
      return await previewVoice(voiceClone.voice_id, t("voiceSampleText"));
    } catch {
      toast(t("voicePreviewError"), "error");
      return null;
    }
  }, [voiceClone.voice_id, t, toast]);

  const handleVoiceDelete = useCallback(async () => {
    setVoiceUploading(true);
    try {
      await deleteMyVoice();
      // 삭제하는 본인 음성이 "사용 중" 이었으면 선택도 해제한다.
      setSelectedVoiceId((prev) => (prev === ownVoiceId ? null : prev));
      setVoiceClone({ status: "none" });
      await reloadVoices();
    } catch {
      toast(t("voiceDeleteError"), "error");
    } finally {
      setVoiceUploading(false);
    }
  }, [toast, t, reloadVoices, ownVoiceId]);

  if (loading) return <LoadingSpinner fullScreen label={t("loading")} />;

  return (
    <PageContainer>
      <div className="space-y-6" data-testid="avatars-page">
        <PageHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          subtitle={t("subtitle")}
          actions={
            <div
              style={{
                display: "flex",
                alignItems: "stretch",
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              <AvatarBuilderBar
                look={selectedAvatar}
                voiceName={selectedVoiceName}
                onCreate={handleOpenBuilder}
                creating={applying}
                t={t}
              />
              {/* 현재 강의에 지정된 아바타 — 미리보기 썸네일(클릭 시 영상). 강의
                  컨텍스트(?lecture=)가 있고 지정 아바타가 있을 때만 노출. */}
              {lectureId && currentAvatarDisplay && (
                <CurrentAvatarChip
                  name={currentAvatarDisplay.name}
                  imageUrl={currentAvatarDisplay.imageUrl}
                  videoUrl={currentAvatarDisplay.videoUrl}
                  reducedMotion={reducedMotion}
                  t={t}
                />
              )}
            </div>
          }
        />

        {deferred && (
          <div
            role="status"
            data-testid="avatars-deferred-banner"
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              fontSize: 13,
              lineHeight: 1.5,
              color: "var(--gold-on-light)",
              background: "var(--gold-soft)",
              border: "1px solid var(--gold-medium)",
            }}
          >
            {t("deferredBanner")}
          </div>
        )}

        {!lectureId && (
          <p style={{ fontSize: 12.5, color: "var(--text-subtle)", margin: 0 }}>
            {t("applyHintNoLecture")}
          </p>
        )}

        {/* 아바타 제작 작업대 — "룩과 목소리 아바타 제작"을 누르면 열려 그 자리에서
            아바타를 렌더하고(가로 16:9 영상 위 + 스크립트·적용 아래), 성능을 확인한 뒤
            강의에 적용한다. 페이지 최상단(헤더 바로 아래)에 둬, 제작 클릭 즉시 보이도록
            한다(2026-06-05 사용자 피드백: 이전엔 페이지 맨 아래에서 열려 안 보였음).
            builderOpen=false 면 컴포넌트가 스스로 null 을 반환해 아무것도 차지하지 않는다. */}
        <AvatarScriptTest
          look={selectedAvatar}
          voiceId={selectedVoiceId}
          voiceName={selectedVoiceName}
          active={builderOpen}
          renderNonce={renderNonce}
          lectureId={lectureId}
          applying={applying}
          onApplyToLecture={handleApply}
          onPrepareRender={handlePrepareRender}
          onSaveAvatar={handleSaveAvatar}
          saving={savingAvatar}
          reducedMotion={reducedMotion}
          t={t}
        />

        {/* 아바타 제작 방식 — "교수자 본인 아바타"(본인 사진 업로드 → Hedra) vs
            "타인 아바타"(플랫폼 제공 HeyGen 샘플). 토글이 아래 제작 카드와 갤러리·
            라이브러리 구분을 함께 전환한다. */}
        <AvatarCreateTypeToggle value={createType} onChange={setCreateType} t={t} />

        {createType === "photo" ? (
          // 교수자 본인 아바타 — 준비한 본인 사진을 직접 업로드(AI 룩 생성 폐지).
          // Q&A 답변은 이 얼굴로 Hedra 합성한다.
          <OwnPhotoUploadCard
            onUpload={handleUploadOwnPhoto}
            uploading={uploadingOwnPhoto}
            t={t}
          />
        ) : (
          // 타인 아바타 — 플랫폼 제공 HeyGen 표준 아바타를 등록·선택한다.
          <StandardAvatarRegisterCard
            onRegistered={handleStandardRegistered}
            lectureId={lectureId}
            t={t}
          />
        )}

        {/* 내 아바타(룩 + 음성 조합) 갤러리 — 현재 토글(본인/타인)에 해당하는 항목만
            보여 준다. 저장한 조합을 재생성 없이 바로 강의에 적용한다. */}
        <SavedAvatarGallery
          items={visibleSavedAvatars}
          resolveLookImage={resolveLookImage}
          resolveVoiceName={resolveSavedVoiceName}
          canApply={!!lectureId}
          applyingId={applyingSavedId}
          onApply={handleApplySaved}
          onRename={handleRenameSaved}
          onDelete={handleDeleteSaved}
          onPreview={handlePreviewSaved}
          reducedMotion={reducedMotion}
          t={t}
        />

        {/* 최근 선택한 아바타 + 저장된 아바타·룩 라이브러리 — 재생성 없이 즉시 선택/적용.
            만든 아바타·룩이 없으면 컴포넌트가 스스로 아무것도 렌더하지 않는다. */}
        <AvatarLibrary
          recent={visibleRecent}
          items={visibleLibraryItems}
          selectedId={selectedId}
          onOpen={handleOpen}
          onRenameLook={handleRenameLook}
          onUseForBuild={() => recentId && handleUseForBuild(recentId)}
          renameEnabled={renameEnabled}
          onRename={handleRename}
          onDelete={handleLibraryDelete}
          t={t}
        />

        {/* ② 내 목소리로 음성 만들기 — 파일 업로드 + 브라우저 직접 녹음 + 읽기 대본
            + "이 음성을 아바타 제작에 사용"(샘플 보이스와 상호 배타) */}
        <VoiceCloneUploadCard
          onSubmit={handleVoiceUpload}
          onDelete={handleVoiceDelete}
          onPreview={handleVoicePreview}
          onRequestScript={handleRequestScript}
          status={voiceClone.status}
          uploading={voiceUploading}
          voiceName={voiceClone.name}
          message={voiceClone.message}
          selectedForAvatar={ownVoiceSelected}
          onUseForAvatar={handleToggleOwnVoice}
          t={t}
        />

        {/* ②-b 샘플 목소리 선택 — 스튜디오 "음성과 자막"에서 옮겨온 음성 선택.
            본인 목소리(위 카드) 또는 샘플 보이스 중 하나를 골라 강의 목소리로 쓴다. */}
        <SampleVoicePicker
          voices={voices}
          loading={voicesLoading}
          selectedId={selectedVoiceId}
          onSelect={handleToggleSampleVoice}
          ownVoiceId={ownVoiceId}
          moreVoicesHref={`/professor/voices?return=avatars${lectureId ? `&lecture=${lectureId}` : ""}`}
          t={t}
        />

        {/* 라이브러리 룩/아바타 큰 보기 — 가로형 전체 + 연필 이름 지정 */}
        {viewerAvatar && (
          <AvatarViewerModal
            key={viewerAvatar.id}
            avatar={viewerAvatar}
            onUseForBuild={(id) => {
              // 강의에 바로 적용하지 않고 상단 "룩" 슬롯으로 선택한 뒤 모달을 닫는다.
              handleUseForBuild(id);
              setViewerId(null);
            }}
            onRename={handleRenameLook}
            onClose={() => setViewerId(null)}
            t={t}
          />
        )}
      </div>
    </PageContainer>
  );
}
