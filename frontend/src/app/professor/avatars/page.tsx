"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/professor/shell";
import { useToast } from "@/components/ui/Toast";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useAvatarsI18n } from "@/components/professor/avatars/useAvatarsI18n";
import { useReducedMotion } from "@/components/professor/avatars/useReducedMotion";
import AvatarLibrary from "@/components/professor/avatars/AvatarLibrary";
import AvatarViewerModal from "@/components/professor/avatars/AvatarViewerModal";
import PhotoAvatarStudioCard from "@/components/professor/avatars/PhotoAvatarStudioCard";
import VoiceCloneUploadCard from "@/components/professor/avatars/VoiceCloneUploadCard";
import SampleVoicePicker from "@/components/professor/avatars/SampleVoicePicker";
import AvatarBuilderBar from "@/components/professor/avatars/AvatarBuilderBar";
import AvatarScriptTest from "@/components/professor/avatars/AvatarScriptTest";
import { selectLook } from "@/components/professor/avatars/onboarding/photoAvatarApi";
import {
  applyAvatarToLecture,
  applyVoiceToLecture,
  deleteMyLook,
  deleteMyVoice,
  getLectureTitle,
  getMyVoice,
  getRecentAvatarId,
  listAvatars,
  listMyLooks,
  renameAvatarForLecture,
  renameMyLook,
  requestVoiceScript,
  setRecentAvatar,
  uploadVoiceSample,
} from "@/components/professor/avatars/avatarsApi";
import type { MyLook, ScriptLanguage } from "@/components/professor/avatars/avatarsApi";
import { listVoiceOptions, previewVoice } from "@/components/professor/avatars/voicesApi";
import type {
  Avatar,
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

  // 녹음 대본 주제로 쓸 현재 강의 제목(없으면 null → 일반 학술 대본).
  const [lectureTitle, setLectureTitle] = useState<string | null>(null);

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
    const customAvatars = avatars.filter((a) => a.is_custom);
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
        status: "ready" as const,
      }));
    // 같은 id 중복 제거(본인 아바타와 룩이 우연히 겹칠 일은 없으나 방어적으로).
    const seen = new Set<string>();
    return [...customAvatars, ...lookAvatars].filter((a) =>
      seen.has(a.id) ? false : (seen.add(a.id), true),
    );
  }, [avatars, looks, t]);

  // 선택/최근 id 를 (표준 아바타 ∪ 라이브러리)에서 해석한다.
  const resolveAvatar = useCallback(
    (id: string | null): Avatar | null => {
      if (!id) return null;
      return (
        avatars.find((a) => a.id === id) ??
        libraryItems.find((a) => a.id === id) ??
        null
      );
    },
    [avatars, libraryItems],
  );

  const recentAvatar = useMemo(
    () => resolveAvatar(recentId),
    [resolveAvatar, recentId],
  );

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

  // 카드/최근 박스 클릭 — 큰 보기(뷰어)를 열고, 동시에 선택(최근/미리보기 반영)한다.
  const handleOpen = useCallback(
    (avatar: Avatar) => {
      handleSelect(avatar.id);
      setViewerId(avatar.id);
    },
    [handleSelect],
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

  // 룩 이름 저장(연필) — 낙관적으로 룩 목록의 name 을 갱신하고 서버에 반영한다.
  const handleRenameLook = useCallback(
    async (lookId: string, name: string) => {
      const next = name.trim();
      setLooks((prev) =>
        prev.map((l) => (l.id === lookId ? { ...l, name: next || null } : l)),
      );
      try {
        await renameMyLook(lookId, next);
        toast(t("lookRenameSuccess"), "success");
      } catch {
        toast(t("lookRenameError"), "error");
        // 실패 시 서버 기준으로 되돌린다.
        await refreshAvatars();
      }
    },
    [toast, t, refreshAvatars],
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
        await applyAvatarToLecture(lectureId, id);
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
    [lectureId, router, toast, t, selectedVoiceId],
  );

  const handleApply = useCallback(
    () => doApply(selectedId),
    [doApply, selectedId],
  );

  // "룩과 목소리 아바타 제작" — 본인(사진) 아바타는 아래 작업대를 열어 그 자리에서
  // 렌더·성능 확인 후 적용한다. 표준 HeyGen 아바타는 인라인 렌더 대상이 아니므로
  // (Talking Photo 없음) 바로 강의에 적용한다.
  const handleOpenBuilder = useCallback(() => {
    if (!selectedId || !selectedVoiceId) return;
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
      // 낙관적 제거 — 룩(라이브러리 본체)과 본인 아바타 양쪽에서 동시에 뺀다.
      setLooks((prev) => prev.filter((l) => l.id !== id));
      setAvatars((prev) => prev.filter((a) => !(a.is_custom && a.id === id)));
      setSelectedId((prev) => (prev === id ? null : prev));
      setRecentId((prev) => (prev === id ? null : prev));
      try {
        await deleteMyLook(id);
        toast(t("cardDeleteSuccess"), "success");
      } catch {
        toast(t("cardDeleteError"), "error");
      } finally {
        // 서버 기준으로 목록을 다시 맞춘다(낙관적 제거 보정).
        await refreshAvatars();
      }
    },
    [t, toast, refreshAvatars],
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
            <AvatarBuilderBar
              look={selectedAvatar}
              voiceName={selectedVoiceName}
              onCreate={handleOpenBuilder}
              creating={applying}
              t={t}
            />
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

        {/* 최근 선택한 아바타 + 저장된 아바타·룩 라이브러리 — 재생성 없이 즉시 선택/적용.
            만든 아바타·룩이 없으면 컴포넌트가 스스로 아무것도 렌더하지 않는다. */}
        <AvatarLibrary
          recent={recentAvatar}
          items={libraryItems}
          selectedId={selectedId}
          onOpen={handleOpen}
          onRenameLook={handleRenameLook}
          onUseForBuild={() => recentId && handleUseForBuild(recentId)}
          renameEnabled={renameEnabled}
          onRename={handleRename}
          onDelete={handleLibraryDelete}
          t={t}
        />

        {/* ① 내 사진으로 아바타 만들기 — Design with AI 룩 온보딩을 카드 안에 인라인 임베드 */}
        <PhotoAvatarStudioCard
          reducedMotion={reducedMotion}
          onConfirmed={refreshAvatars}
          onLibraryChanged={refreshAvatars}
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
          t={t}
        />

        {/* 아바타 제작 작업대 — "룩과 목소리 아바타 제작"을 누르면 열려 그 자리에서
            아바타를 렌더하고, 스크립트로 성능을 확인한 뒤 강의에 적용한다. */}
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
          reducedMotion={reducedMotion}
          t={t}
        />

        {/* 라이브러리 룩/아바타 큰 보기 — 가로형 전체 + 연필 이름 지정 */}
        {viewerAvatar && (
          <AvatarViewerModal
            key={viewerAvatar.id}
            avatar={viewerAvatar}
            canApply={!!lectureId}
            applying={applying}
            onApply={(id) => doApply(id)}
            onRename={handleRenameLook}
            onClose={() => setViewerId(null)}
            t={t}
          />
        )}
      </div>
    </PageContainer>
  );
}
