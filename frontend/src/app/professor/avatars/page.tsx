"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/professor/shell";
import { useToast } from "@/components/ui/Toast";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useAvatarsI18n } from "@/components/professor/avatars/useAvatarsI18n";
import { useReducedMotion } from "@/components/professor/avatars/useReducedMotion";
import AvatarCard from "@/components/professor/avatars/AvatarCard";
import AvatarPreviewStage from "@/components/professor/avatars/AvatarPreviewStage";
import AvatarLibrary from "@/components/professor/avatars/AvatarLibrary";
import AvatarBuilderBar from "@/components/professor/avatars/AvatarBuilderBar";
import AvatarBuildStudio from "@/components/professor/avatars/AvatarBuildStudio";
import PhotoAvatarStudioCard from "@/components/professor/avatars/PhotoAvatarStudioCard";
import VoiceCloneUploadCard from "@/components/professor/avatars/VoiceCloneUploadCard";
import {
  applyAvatarToLecture,
  deleteMyVoice,
  getLectureTitle,
  getMyVoice,
  getRecentAvatarId,
  listAvatars,
  listMyLooks,
  renameAvatarForLecture,
  requestVoiceScript,
  setRecentAvatar,
  uploadVoiceSample,
} from "@/components/professor/avatars/avatarsApi";
import type { MyLook, ScriptLanguage } from "@/components/professor/avatars/avatarsApi";
import { selectLook } from "@/components/professor/avatars/onboarding/photoAvatarApi";
import { listVoiceOptions, previewVoice } from "@/components/professor/avatars/voicesApi";
import type {
  Avatar,
  VoiceClone,
  VoiceScriptResult,
} from "@/components/professor/avatars/avatarsTypes";
import { getVoiceById, type VoiceOption } from "@/components/professor/avatars/voicePresets";

/**
 * /professor/avatars — 강의 아바타 고르기 (HeyGen 스타일 대수술).
 *
 * docs/planning/05-instructor-pages.md (아바타 선택) + 12-self-avatar-onboarding.md
 * + design-system v2 (라이트 베이지 + 골드). 세 갈래:
 *  ① 내 사진으로 아바타 만들기 — Photo Avatar + Design with AI 룩 온보딩을
 *     카드 안에 인라인 임베드(PhotoAvatarStudioCard, 별도 라우트로 안 보냄).
 *  ② 내 목소리로 음성 만들기 — 파일 업로드 + 브라우저 직접 녹음(MediaRecorder)
 *     + 강의 주제 연관 읽기 대본(VoiceCloneUploadCard).
 *  ③ 기본 HeyGen 남/여 샘플을 영상으로 비교하고 강의에 적용.
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
  const [error, setError] = useState(false);
  const [deferred, setDeferred] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  // "룩과 목소리 아바타 제작" 빌더 상태 — 아바타 = 룩 + 음성.
  //  buildLookId: 라이브러리에서 "아바타 제작에 사용"으로 확정한 룩.
  //  buildVoiceId: 아래 음성 패널에서 최종 선택한 음성.
  //  builderOpen / renderNonce: 제작 버튼을 누르면 작업대를 열고 렌더를 트리거한다.
  const [buildLookId, setBuildLookId] = useState<string | null>(null);
  const [buildVoiceId, setBuildVoiceId] = useState<string | null>(null);
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
        setError(false);
        const { avatars: list, deferred: isDeferred } = await listAvatars();
        if (cancelled) return;
        setAvatars(list);
        setDeferred(isDeferred);
      } catch {
        if (!cancelled) setError(true);
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

  // 본인 아바타(is_custom)·룩은 위쪽 "저장된 아바타·룩 라이브러리"(AvatarLibrary)가
  // 전담한다. 아래 섹션은 표준 HeyGen 아바타만 성별로 그룹핑한다(중복 노출 방지).
  const sections = useMemo(() => {
    const male = avatars.filter((a) => !a.is_custom && a.gender === "male");
    const female = avatars.filter((a) => !a.is_custom && a.gender === "female");
    const other = avatars.filter(
      (a) => !a.is_custom && a.gender !== "male" && a.gender !== "female",
    );
    return [
      { key: "male", label: t("sectionMale"), items: male },
      { key: "female", label: t("sectionFemale"), items: female },
      { key: "other", label: t("sectionOther"), items: other },
    ].filter((s) => s.items.length > 0);
  }, [avatars, t]);

  // 라이브러리 = 교수자가 만든 본인 아바타(talking photo) + ready 룩. 룩은 렌더용
  // avatar_id 로 그대로 통용되므로(video.py) 동일 Avatar shape 로 정규화한다.
  const libraryItems = useMemo<Avatar[]>(() => {
    const customAvatars = avatars.filter((a) => a.is_custom);
    const lookAvatars: Avatar[] = looks
      .filter((l) => l.status === "ready")
      .map((l) => ({
        id: l.id,
        name: l.prompt?.trim() || t("lookUntitled"),
        preview_image_url: l.preview_image_url,
        preview_video_url: null,
        is_custom: true,
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

  const selectedAvatar = useMemo(
    () => resolveAvatar(selectedId),
    [resolveAvatar, selectedId],
  );

  const recentAvatar = useMemo(
    () => resolveAvatar(recentId),
    [resolveAvatar, recentId],
  );

  // 빌더에 확정된 룩·음성 — 상단 박스와 작업대가 공유한다.
  const buildLook = useMemo(
    () => resolveAvatar(buildLookId),
    [resolveAvatar, buildLookId],
  );
  const buildVoice = useMemo(
    () => getVoiceById(voices, buildVoiceId),
    [voices, buildVoiceId],
  );

  // 본인 룩(MyLook) 인지 — me/preview 렌더 대상(기본 룩으로 지정해야 함).
  const isMyLook = useCallback(
    (id: string) => looks.some((l) => l.id === id),
    [looks],
  );

  // 아바타/룩 선택 — 재생성 없이 즉시. 최근 선택을 서버에 영속화한다(실패는 무시).
  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    setRecentId(id);
    void setRecentAvatar(id).catch(() => {});
  }, []);

  // "아바타 제작에 사용" — 라이브러리에서 고른 룩을 제작용 룩으로 확정한다.
  // (강의에 바로 적용하지 않는다 — 음성과 함께 상단 "룩과 목소리 아바타 제작"에서
  // 최종 제작·적용한다.) 본인 룩이면 기본 룩으로 지정해 me/preview 가 그 룩을
  // 렌더하도록 한다(실패는 토스트로만 알림).
  const handleUseForBuild = useCallback(
    async (id: string) => {
      setBuildLookId(id);
      setSelectedId(id); // 아래 미리보기·음성 패널도 이 룩으로 맞춘다.
      setBuilderOpen(false); // 룩이 바뀌었으니 작업대는 다시 제작 버튼으로 연다.
      toast(t("useForBuildDone"), "success");
      if (isMyLook(id)) {
        try {
          await selectLook(id);
        } catch {
          /* 기본 룩 지정 실패는 무시 — 제작 시 안내된다. */
        }
      }
    },
    [isMyLook, toast, t],
  );

  // "룩과 목소리 아바타 제작" — 작업대를 열고 현재 스크립트로 렌더를 트리거한다.
  const handleCreateAvatar = useCallback(() => {
    if (!buildLookId || !buildVoiceId) return;
    setBuilderOpen(true);
    setRenderNonce((n) => n + 1);
  }, [buildLookId, buildVoiceId]);

  // 제작한 아바타(룩+음성)를 현재 강의에 적용하고 편집기로 복귀.
  const handleApplyBuildToLecture = useCallback(async () => {
    if (!lectureId || !buildLookId) return;
    setApplying(true);
    try {
      await applyAvatarToLecture(lectureId, buildLookId, buildVoiceId);
      toast(t("applySuccess"), "success");
      router.push(`/professor/studio/${lectureId}`);
    } catch {
      toast(t("applyError"), "error");
    } finally {
      setApplying(false);
    }
  }, [lectureId, buildLookId, buildVoiceId, router, toast, t]);

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
      setVoiceClone({ status: "none" });
      await reloadVoices();
    } catch {
      toast(t("voiceDeleteError"), "error");
    } finally {
      setVoiceUploading(false);
    }
  }, [toast, t, reloadVoices]);

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
              look={buildLook}
              voice={buildVoice}
              onCreate={handleCreateAvatar}
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
          onSelect={handleSelect}
          onUseForBuild={() => recentId && handleUseForBuild(recentId)}
          renameEnabled={renameEnabled}
          onRename={handleRename}
          t={t}
        />

        {/* 룩 + 음성으로 아바타 제작 — 제작 버튼을 누르면 열려 말하는 아바타를
            만들고 스크립트로 확인한 뒤 강의에 적용한다. */}
        <AvatarBuildStudio
          look={buildLook}
          voice={buildVoice}
          active={builderOpen}
          renderNonce={renderNonce}
          lectureId={lectureId}
          applying={applying}
          onApplyToLecture={handleApplyBuildToLecture}
          reducedMotion={reducedMotion}
          t={t}
        />

        {/* ① 내 사진으로 아바타 만들기 — Design with AI 룩 온보딩을 카드 안에 인라인 임베드 */}
        <PhotoAvatarStudioCard
          reducedMotion={reducedMotion}
          onConfirmed={refreshAvatars}
        />

        {/* ② 내 목소리로 음성 만들기 — 파일 업로드 + 브라우저 직접 녹음 + 읽기 대본 */}
        <VoiceCloneUploadCard
          onSubmit={handleVoiceUpload}
          onDelete={handleVoiceDelete}
          onPreview={handleVoicePreview}
          onRequestScript={handleRequestScript}
          status={voiceClone.status}
          uploading={voiceUploading}
          voiceName={voiceClone.name}
          message={voiceClone.message}
          t={t}
        />

        {/* 클릭한 아바타를 크게 재생 + 음성 함께 듣기 */}
        <AvatarPreviewStage
          avatar={selectedAvatar}
          voices={voices}
          voicesLoading={voicesLoading}
          reducedMotion={reducedMotion}
          onVoiceChange={setBuildVoiceId}
          t={t}
        />

        {error ? (
          <div
            role="alert"
            style={{
              borderRadius: 14,
              border: "1px solid rgba(239,68,68,0.3)",
              background: "rgba(239,68,68,0.06)",
              padding: 20,
              fontSize: 13,
              color: "var(--warning)",
            }}
          >
            {t("loadError")}
          </div>
        ) : avatars.length === 0 ? (
          <div
            style={{
              borderRadius: 14,
              border: "1px solid var(--line)",
              background: "var(--bg-card)",
              padding: 32,
              textAlign: "center",
              fontSize: 13,
              color: "var(--text-muted)",
            }}
          >
            {t("empty")}
          </div>
        ) : (
          sections.map((section) => (
            <section key={section.key} data-testid={`avatars-section-${section.key}`}>
              <h2
                style={{
                  margin: "0 0 12px",
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--text-faint)",
                }}
              >
                {section.label}
              </h2>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fill, minmax(150px, 1fr))",
                  gap: 14,
                }}
              >
                {section.items.map((a) => (
                  <AvatarCard
                    key={a.id}
                    avatar={a}
                    selected={a.id === selectedId}
                    onSelect={handleSelect}
                    renameEnabled={renameEnabled}
                    onRename={(name) => handleRename(a.id, name)}
                    t={t}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </PageContainer>
  );
}
