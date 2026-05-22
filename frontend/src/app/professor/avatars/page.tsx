"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageContainer, PageHeader, PrimaryButton } from "@/components/professor/shell";
import { useToast } from "@/components/ui/Toast";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useAvatarsI18n } from "@/components/professor/avatars/useAvatarsI18n";
import { useReducedMotion } from "@/components/professor/avatars/useReducedMotion";
import AvatarCard from "@/components/professor/avatars/AvatarCard";
import ProfilePhotoUploadCard from "@/components/professor/avatars/ProfilePhotoUploadCard";
import {
  applyAvatarToLecture,
  listAvatars,
  renameAvatarForLecture,
  uploadProfilePhoto,
} from "@/components/professor/avatars/avatarsApi";
import type {
  Avatar,
  CustomAvatarStatus,
} from "@/components/professor/avatars/avatarsTypes";

/**
 * /professor/avatars — 아바타 갤러리.
 *
 * docs/planning/05-instructor-pages.md (아바타 선택) + design-system v2
 * (라이트 베이지 + 골드). HeyGen 남/여 샘플을 영상으로 비교하고, 강의에
 * 적용하고, 본인 사진으로 커스텀 아바타를 만들 수 있다.
 *
 * 백엔드 계약(창1)은 미배포 — avatarsApi 가 fixture/시뮬레이션으로 폴백한다.
 * ``?lecture={id}`` 진입 시 선택/이름 변경이 해당 강의에 저장되고 studio 로
 * 복귀한다.
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

  const [customUploading, setCustomUploading] = useState(false);
  const [customStatus, setCustomStatus] = useState<CustomAvatarStatus | null>(
    null,
  );
  const readyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(
    () => () => {
      if (readyTimer.current) clearTimeout(readyTimer.current);
    },
    [],
  );

  const sections = useMemo(() => {
    const custom = avatars.filter((a) => a.is_custom);
    const male = avatars.filter((a) => !a.is_custom && a.gender === "male");
    const female = avatars.filter((a) => !a.is_custom && a.gender === "female");
    const other = avatars.filter(
      (a) => !a.is_custom && a.gender !== "male" && a.gender !== "female",
    );
    return [
      { key: "custom", label: t("sectionCustom"), items: custom },
      { key: "male", label: t("sectionMale"), items: male },
      { key: "female", label: t("sectionFemale"), items: female },
      { key: "other", label: t("sectionOther"), items: other },
    ].filter((s) => s.items.length > 0);
  }, [avatars, t]);

  const handleApply = useCallback(async () => {
    if (!lectureId || !selectedId) return;
    setApplying(true);
    try {
      await applyAvatarToLecture(lectureId, selectedId);
      toast(t("applySuccess"), "success");
      router.push(`/professor/studio/${lectureId}`);
    } catch {
      toast(t("applyError"), "error");
    } finally {
      setApplying(false);
    }
  }, [lectureId, selectedId, router, toast, t]);

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

  const handleUpload = useCallback(
    async (file: File) => {
      setCustomUploading(true);
      try {
        const resp = await uploadProfilePhoto(file);
        setCustomStatus(resp.status);
        const customAvatar: Avatar = {
          id: resp.id,
          name: resp.name ?? t("customBadge"),
          preview_image_url: resp.preview_image_url ?? null,
          preview_video_url: null,
          gender: null,
          is_custom: true,
          status: resp.status,
        };
        // 기존 커스텀 항목을 교체하고 맨 앞에 prepend.
        setAvatars((prev) => [
          customAvatar,
          ...prev.filter((a) => !a.is_custom),
        ]);
        setSelectedId(resp.id);

        // 백엔드 미배포 시 processing → ready 전환을 시뮬레이션 (UI 확인용).
        if (deferred && resp.status === "processing") {
          readyTimer.current = setTimeout(() => {
            setCustomStatus("ready");
            setAvatars((prev) =>
              prev.map((a) =>
                a.id === resp.id ? { ...a, status: "ready" } : a,
              ),
            );
          }, 2500);
        }
      } catch {
        setCustomStatus("failed");
        toast(t("uploadError"), "error");
      } finally {
        setCustomUploading(false);
      }
    },
    [deferred, toast, t],
  );

  if (loading) return <LoadingSpinner fullScreen label={t("loading")} />;

  return (
    <PageContainer>
      <div className="space-y-6" data-testid="avatars-page">
        <PageHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          subtitle={t("subtitle")}
          actions={
            lectureId ? (
              <PrimaryButton
                variant="primary"
                onClick={handleApply}
                disabled={!selectedId || applying}
                data-testid="avatars-apply"
              >
                {applying ? t("applying") : t("applyToLecture")}
              </PrimaryButton>
            ) : undefined
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

        <ProfilePhotoUploadCard
          onSubmit={handleUpload}
          status={customStatus}
          uploading={customUploading}
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
                    onSelect={setSelectedId}
                    reducedMotion={reducedMotion}
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
