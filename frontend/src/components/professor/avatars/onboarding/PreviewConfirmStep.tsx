"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import VoiceCloneUploadCard from "../VoiceCloneUploadCard";
import {
  deleteMyVoice,
  getMyVoice,
  uploadVoiceSample,
} from "../avatarsApi";
import { previewVoice } from "../voicesApi";
import { useAvatarsI18n } from "../useAvatarsI18n";
import type { VoiceClone } from "../avatarsTypes";
import type { Look } from "./photoAvatarTypes";
import { usePhotoAvatarPreview } from "./usePhotoAvatarPreview";
import { PersonIcon, PlayIcon } from "./PhotoAvatarIcons";

interface PreviewConfirmStepProps {
  selectedLook: Look | null;
  reducedMotion: boolean;
  /** ④ 룩 선택으로 되돌아감. */
  onBack: () => void;
  /** 확정 — 본인 얼굴·목소리 아바타 온보딩 완료. */
  onConfirm: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * ⑤ 본인 목소리로 움직이는 미리보기 → 확정.
 *
 * 음성 클론은 기존 기능을 그대로 재사용한다(VoiceCloneUploadCard + avatarsApi
 * /api/avatars/me/voice). 본인 음성이 준비되면 그 음성으로 선택한 룩의 짧은
 * 움직이는 미리보기를 1회 렌더(/api/avatars/me/preview)해 검수한 뒤 확정한다.
 */
export default function PreviewConfirmStep({
  selectedLook,
  reducedMotion,
  onBack,
  onConfirm,
  t,
}: PreviewConfirmStepProps) {
  // 음성 카드의 카피는 기존 avatars 네임스페이스를 그대로 사용(재사용).
  const { t: tVoice } = useAvatarsI18n();

  const [voiceClone, setVoiceClone] = useState<VoiceClone>({ status: "none" });
  const [voiceUploading, setVoiceUploading] = useState(false);
  const preview = usePhotoAvatarPreview(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const v = await getMyVoice();
        if (!cancelled) setVoiceClone(v);
      } catch {
        /* 미배포/실패 → none 유지 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleVoiceUpload = useCallback(async (file: File) => {
    setVoiceUploading(true);
    try {
      const v = await uploadVoiceSample(file);
      setVoiceClone(v);
    } catch {
      setVoiceClone({ status: "failed" });
    } finally {
      setVoiceUploading(false);
    }
  }, []);

  const handleVoiceDelete = useCallback(async () => {
    setVoiceUploading(true);
    try {
      await deleteMyVoice();
      setVoiceClone({ status: "none" });
    } catch {
      /* 무시 — 카드가 기존 상태 유지 */
    } finally {
      setVoiceUploading(false);
    }
  }, []);

  const handleVoicePreview = useCallback(async (): Promise<Blob | null> => {
    if (!voiceClone.voice_id) return null;
    try {
      return await previewVoice(voiceClone.voice_id, tVoice("voiceSampleText"));
    } catch {
      return null;
    }
  }, [voiceClone.voice_id, tVoice]);

  const voiceReady = voiceClone.status === "ready";
  const generating = preview.status === "processing";

  return (
    <div data-testid="step-preview" style={cardStyle}>
      <h2 style={headingStyle}>{t("preview.title")}</h2>
      <p style={descStyle}>{t("preview.description")}</p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
          gap: 20,
          marginTop: 18,
          alignItems: "start",
        }}
      >
        {/* 좌: 움직이는 미리보기 무대 */}
        <div>
          <div style={stageStyle} data-testid="preview-stage">
            {preview.status === "ready" && preview.videoUrl ? (
              <video
                key={preview.videoUrl}
                src={preview.videoUrl}
                controls
                playsInline
                poster={selectedLook?.preview_image_url ?? undefined}
                style={videoStyle}
                data-testid="preview-video"
              />
            ) : selectedLook?.preview_image_url ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selectedLook.preview_image_url}
                  alt={t("preview.selectedAlt")}
                  style={videoStyle}
                />
                {generating && (
                  <span style={stageOverlay} data-testid="preview-generating">
                    {!reducedMotion && <span style={ringStyle} aria-hidden="true" />}
                    <span style={{ marginTop: 10, fontSize: 12.5, fontWeight: 600 }}>
                      {t("preview.generating")}
                    </span>
                  </span>
                )}
              </>
            ) : (
              <span style={stagePlaceholder}>
                <PersonIcon size={40} mono style={{ color: "var(--text-faint)" }} />
                <span style={{ marginTop: 10, fontSize: 12.5, color: "var(--text-muted)" }}>
                  {t("preview.noLook")}
                </span>
              </span>
            )}
          </div>

          {preview.deferred && preview.status === "ready" && (
            <p style={mockNote} role="note" data-testid="preview-mock-note">
              {t("preview.mockNote")}
            </p>
          )}

          <button
            type="button"
            onClick={() => preview.generate(voiceClone.voice_id, preview.status === "ready")}
            disabled={!voiceReady || generating}
            data-testid="preview-generate"
            style={{
              ...primaryBtn,
              marginTop: 12,
              width: "100%",
              justifyContent: "center",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              opacity: !voiceReady || generating ? 0.45 : 1,
              cursor: !voiceReady || generating ? "not-allowed" : "pointer",
            }}
          >
            <PlayIcon size={16} mono style={{ color: "#0A0A0A" }} />
            {generating
              ? t("preview.generating")
              : preview.status === "ready"
                ? t("preview.regenerate")
                : t("preview.generate")}
          </button>
          <p style={genNote}>
            {voiceReady ? t("preview.generateNote") : t("preview.needVoice")}
          </p>
        </div>

        {/* 우: 본인 음성 (기존 컴포넌트 재사용) */}
        <div>
          <h3 style={subHeadingStyle}>{t("preview.voiceHeading")}</h3>
          <VoiceCloneUploadCard
            onSubmit={handleVoiceUpload}
            onDelete={handleVoiceDelete}
            onPreview={handleVoicePreview}
            status={voiceClone.status}
            uploading={voiceUploading}
            voiceName={voiceClone.name}
            message={voiceClone.message}
            t={tVoice}
          />
        </div>
      </div>

      <div style={footerStyle}>
        <button type="button" onClick={onBack} style={secondaryBtn} data-testid="preview-back">
          {t("preview.back")}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          data-testid="preview-confirm"
          style={primaryBtn}
        >
          {t("preview.confirm")}
        </button>
      </div>
    </div>
  );
}

const cardStyle: CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--line)",
  borderRadius: 16,
  padding: 24,
  boxShadow: "var(--shadow-sm)",
};

const headingStyle: CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 700,
  color: "var(--text)",
};

const subHeadingStyle: CSSProperties = {
  margin: "0 0 10px",
  fontSize: 13,
  fontWeight: 700,
  color: "var(--text)",
};

const descStyle: CSSProperties = {
  margin: "6px 0 0",
  fontSize: 13.5,
  lineHeight: 1.6,
  color: "var(--text-muted)",
};

const stageStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  aspectRatio: "3 / 4",
  maxWidth: 280,
  borderRadius: 14,
  overflow: "hidden",
  background: "var(--bg-subtle)",
  border: "1px solid var(--line)",
  display: "grid",
  placeItems: "center",
};

const videoStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const stageOverlay: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(250, 250, 247, 0.78)",
  color: "var(--gold-on-light)",
};

const stagePlaceholder: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  textAlign: "center",
};

const ringStyle: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: "50%",
  border: "3px solid var(--gold-soft)",
  borderTopColor: "var(--gold)",
  animation: "studio-spin 0.9s linear infinite",
};

const mockNote: CSSProperties = {
  margin: "10px 0 0",
  fontSize: 11,
  lineHeight: 1.5,
  color: "var(--text-faint)",
};

const genNote: CSSProperties = {
  margin: "8px 0 0",
  fontSize: 11.5,
  lineHeight: 1.5,
  color: "var(--text-faint)",
};

const footerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  marginTop: 24,
  flexWrap: "wrap",
};

const secondaryBtn: CSSProperties = {
  padding: "10px 16px",
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 10,
  border: "1px solid var(--line-strong)",
  background: "var(--bg-card)",
  color: "var(--text)",
  cursor: "pointer",
  fontFamily: "inherit",
};

const primaryBtn: CSSProperties = {
  padding: "10px 18px",
  fontSize: 13,
  fontWeight: 700,
  borderRadius: 10,
  border: "1px solid transparent",
  background: "linear-gradient(135deg, #FFB627, #E89E0E)",
  color: "#0A0A0A",
  fontFamily: "inherit",
};
