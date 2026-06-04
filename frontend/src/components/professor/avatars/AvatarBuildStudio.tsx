"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { Avatar } from "./avatarsTypes";
import type { VoiceOption } from "./voicePresets";
import { useCustomAvatarPreview } from "./useCustomAvatarPreview";

interface AvatarBuildStudioProps {
  /** 제작 중인 아바타의 룩(라이브러리에서 확정). */
  look: Avatar | null;
  /** 제작 중인 아바타의 음성(음성 패널에서 확정). */
  voice: VoiceOption | null;
  /** "룩과 목소리 아바타 제작"으로 작업대가 열렸는지. */
  active: boolean;
  /** 제작 버튼을 누를 때마다 증가 — 변경되면 현재 스크립트로 렌더를 시작한다. */
  renderNonce: number;
  /** 강의 컨텍스트(?lecture=) — 있으면 "강의에 적용" 노출. */
  lectureId: string | null;
  applying: boolean;
  /** "이 아바타를 강의에 적용" — 룩+음성을 강의에 저장하고 편집기로 복귀. */
  onApplyToLecture: () => void;
  reducedMotion: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * "아바타 제작" 작업대 — 룩 + 음성으로 말하는 아바타를 HeyGen 으로 만들고,
 * 스크립트를 입력해 잘 처리하는지 확인한 뒤 강의에 적용한다.
 *
 * 본인(사진) 아바타 룩(``is_custom``)은 ``me/preview`` 렌더로 임의 스크립트를
 * 말하게 한다(텍스트·음성 같은 조합은 캐시 적중 → 비용 0). 표준 HeyGen 아바타는
 * 기본 미리보기 영상이 이미 있어 스크립트 테스트 없이 그대로 적용할 수 있다.
 */
export default function AvatarBuildStudio({
  look,
  voice,
  active,
  renderNonce,
  lectureId,
  applying,
  onApplyToLecture,
  reducedMotion,
  t,
}: AvatarBuildStudioProps) {
  const isCustom = !!look?.is_custom;
  const preview = useCustomAvatarPreview(active && isCustom);

  // 스크립트는 기본 확인 문장으로 시작한다(마운트 1회). 사용자가 자유롭게 고친다.
  const [script, setScript] = useState(() => t("builderScriptDefault"));

  const scriptRef = useRef(script);
  useEffect(() => {
    scriptRef.current = script;
  }, [script]);

  // 제작 버튼(renderNonce)을 누르면 현재 스크립트로 렌더를 시작한다(본인 아바타 한정).
  const lastNonceRef = useRef(0);
  useEffect(() => {
    if (!active || renderNonce === lastNonceRef.current) return;
    lastNonceRef.current = renderNonce;
    if (isCustom && voice) {
      const text = (scriptRef.current || "").trim() || t("builderScriptDefault");
      preview.generate(voice.id, false, text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderNonce, active]);

  const speak = useCallback(
    (force: boolean) => {
      if (!voice) return;
      const text = (script || "").trim() || t("builderScriptDefault");
      preview.generate(voice.id, force, text);
    },
    [voice, script, preview, t],
  );

  if (!active || !look || !voice) return null;

  const processing = preview.status === "processing";
  const ready = preview.status === "ready" && !!preview.videoUrl;
  const failed = preview.status === "failed";

  // 본인 아바타: 렌더 영상. 표준 아바타: 룩 자체 미리보기 영상/이미지.
  const videoUrl = isCustom ? preview.videoUrl : look.preview_video_url;
  const hasVideo = !!videoUrl;

  return (
    <section data-testid="avatar-build-studio" style={cardStyle}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={headingStyle}>{t("builderStudioTitle")}</h2>
        <p style={descStyle}>{t("builderStudioDescription")}</p>
      </div>

      <div style={gridStyle}>
        {/* ── 좌: 제작된 아바타 영상 무대 ─────────────────────────────── */}
        <div style={{ minWidth: 0 }}>
          <div style={stageStyle}>
            {hasVideo ? (
              <video
                key={videoUrl ?? look.id}
                src={videoUrl ?? undefined}
                poster={look.preview_image_url ?? undefined}
                controls={isCustom}
                autoPlay={isCustom && !reducedMotion}
                muted={!isCustom}
                loop={!isCustom}
                playsInline
                preload="metadata"
                aria-label={look.name}
                style={mediaFillStyle}
              />
            ) : look.preview_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={look.preview_image_url} alt={look.name} style={mediaFillStyle} />
            ) : (
              <span aria-hidden="true" style={initialStyle}>
                {look.name.slice(0, 1)}
              </span>
            )}

            {processing && (
              <div data-testid="build-rendering" style={overlayStyle}>
                {t("builderRendering")}
              </div>
            )}
          </div>
          <p style={stageCaptionStyle}>
            {look.name} · {voice.name}
          </p>
        </div>

        {/* ── 우: 스크립트 확인(채팅) 박스 ─────────────────────────────── */}
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
          <h3 style={chatHeadingStyle}>{t("builderChatTitle")}</h3>
          <p style={chatNoteStyle}>
            {isCustom ? t("builderChatNote") : t("builderChatNoteStandard")}
          </p>

          {isCustom ? (
            <>
              <textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                maxLength={2000}
                rows={5}
                data-testid="build-script-input"
                placeholder={t("builderScriptPlaceholder")}
                style={textareaStyle}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => speak(false)}
                  disabled={processing}
                  data-testid="build-speak"
                  style={{
                    ...primaryBtn,
                    opacity: processing ? 0.55 : 1,
                    cursor: processing ? "wait" : "pointer",
                  }}
                >
                  {processing ? t("builderRendering") : `▶ ${t("builderSpeak")}`}
                </button>
                {ready && (
                  <button
                    type="button"
                    onClick={() => speak(true)}
                    disabled={processing}
                    data-testid="build-respeak"
                    style={ghostBtn}
                  >
                    {t("builderRespeak")}
                  </button>
                )}
              </div>
              {failed && (
                <p role="alert" style={errorHintStyle}>
                  {preview.message || t("builderRenderFailed")}
                </p>
              )}
              <p style={changeHintStyle}>{t("builderChangeHint")}</p>
            </>
          ) : (
            <p style={changeHintStyle}>{t("builderStandardHint")}</p>
          )}

          {/* 강의에 적용 */}
          <div style={{ marginTop: "auto", paddingTop: 16 }}>
            {lectureId ? (
              <button
                type="button"
                onClick={onApplyToLecture}
                disabled={applying || (isCustom && !ready)}
                data-testid="build-apply"
                style={{
                  ...applyBtn,
                  opacity: applying || (isCustom && !ready) ? 0.5 : 1,
                  cursor: applying || (isCustom && !ready) ? "not-allowed" : "pointer",
                }}
                title={isCustom && !ready ? t("builderApplyNeedsRender") : undefined}
              >
                {applying ? t("applying") : t("builderApply")}
              </button>
            ) : (
              <p style={applyHintStyle}>{t("applyHintNoLecture")}</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

const cardStyle: CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--gold-medium)",
  borderRadius: 16,
  padding: 20,
  boxShadow: "var(--shadow-sm)",
};

const headingStyle: CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 700,
  color: "var(--text)",
};

const descStyle: CSSProperties = {
  margin: "4px 0 0",
  fontSize: 13,
  lineHeight: 1.6,
  color: "var(--text-muted)",
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
  gap: 18,
  alignItems: "stretch",
};

const stageStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  maxWidth: 340,
  margin: "0 auto",
  aspectRatio: "3 / 4",
  borderRadius: 12,
  overflow: "hidden",
  background: "var(--bg-subtle)",
  border: "1px solid var(--line)",
};

const mediaFillStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const initialStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "grid",
  placeItems: "center",
  fontSize: 64,
  fontWeight: 700,
  color: "var(--text-faint)",
};

const overlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "grid",
  placeItems: "center",
  padding: 20,
  textAlign: "center",
  fontSize: 12.5,
  fontWeight: 600,
  color: "#fff",
  background: "rgba(10,10,10,0.5)",
  backdropFilter: "blur(2px)",
};

const stageCaptionStyle: CSSProperties = {
  margin: "10px 0 0",
  textAlign: "center",
  fontSize: 13,
  fontWeight: 600,
  color: "var(--text)",
};

const chatHeadingStyle: CSSProperties = {
  margin: "0 0 4px",
  fontSize: 14,
  fontWeight: 700,
  color: "var(--text)",
};

const chatNoteStyle: CSSProperties = {
  margin: "0 0 12px",
  fontSize: 12,
  lineHeight: 1.5,
  color: "var(--text-muted)",
};

const textareaStyle: CSSProperties = {
  width: "100%",
  resize: "vertical",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid var(--line-strong)",
  background: "var(--bg-card)",
  color: "var(--text)",
  fontFamily: "inherit",
  fontSize: 13,
  lineHeight: 1.6,
};

const primaryBtn: CSSProperties = {
  padding: "9px 16px",
  fontSize: 13,
  fontWeight: 700,
  borderRadius: 10,
  border: "1px solid transparent",
  background: "linear-gradient(135deg, #FFB627, #E89E0E)",
  color: "#0A0A0A",
  fontFamily: "inherit",
};

const ghostBtn: CSSProperties = {
  padding: "9px 16px",
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 10,
  border: "1px solid var(--line-strong)",
  background: "var(--bg-card)",
  color: "var(--text)",
  fontFamily: "inherit",
  cursor: "pointer",
};

const errorHintStyle: CSSProperties = {
  margin: "10px 0 0",
  fontSize: 12,
  lineHeight: 1.5,
  color: "var(--warning)",
};

const changeHintStyle: CSSProperties = {
  margin: "10px 0 0",
  fontSize: 11.5,
  lineHeight: 1.5,
  color: "var(--text-faint)",
};

const applyBtn: CSSProperties = {
  width: "100%",
  padding: "12px 18px",
  fontSize: 14,
  fontWeight: 700,
  borderRadius: 12,
  border: "1px solid transparent",
  background: "linear-gradient(135deg, #FFB627, #E89E0E)",
  color: "#0A0A0A",
  fontFamily: "inherit",
};

const applyHintStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  lineHeight: 1.5,
  color: "var(--text-subtle)",
};
