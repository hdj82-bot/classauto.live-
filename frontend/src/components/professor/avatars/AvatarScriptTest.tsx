"use client";

import { useCallback, useState, type CSSProperties } from "react";
import type { Avatar } from "./avatarsTypes";
import { useScriptTestPreview } from "./useScriptTestPreview";

interface AvatarScriptTestProps {
  /** 현재 선택된 룩(아바타). 본인(사진) 아바타일 때만 스크립트 테스트가 가능하다. */
  look: Avatar | null;
  /** "아바타 제작에 사용"으로 고른 음성 id. null = 미선택. */
  voiceId: string | null;
  /** 선택 음성 표시 이름(없으면 기본 보이스). */
  voiceName?: string | null;
  /**
   * 렌더 직전 준비 훅 — 선택한 룩을 me/preview 렌더 대상(기본 룩)으로 맞춘다.
   * 본인 룩(MyLook)이면 기본 룩으로 지정(select)한다. 완료될 때까지 await 한다.
   */
  onPrepareRender?: () => Promise<void>;
  reducedMotion: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * "아바타 미리 확인 — 스크립트 테스트" 카드.
 *
 * 룩 + 음성으로 만든 Q&A 아바타가 실제로 어떻게 말하는지, 임의 스크립트를 넣어
 * HeyGen 렌더로 확인한다(`me/preview` 가 본인 Talking Photo 로 그 대본을 말하게 한다).
 * 같은 (음성·대본) 조합은 백엔드 캐시로 즉시(비용 0). 룩·음성을 바꿔 다시 확인하고,
 * 만족하면 우측 상단 "룩과 목소리 아바타 제작"으로 강의에 적용한다.
 *
 * 본인 룩(`is_custom`)이 선택됐고 음성이 골라졌을 때만 노출된다. 표준 HeyGen
 * 아바타는 큰 보기(뷰어) 모달의 기본 미리보기 영상으로 확인한다(여긴 렌더 불가).
 */
export default function AvatarScriptTest({
  look,
  voiceId,
  voiceName,
  onPrepareRender,
  reducedMotion,
  t,
}: AvatarScriptTestProps) {
  const enabled = !!look?.is_custom && !!voiceId;
  const preview = useScriptTestPreview(enabled);
  const [script, setScript] = useState(() => t("scriptTestDefault"));

  const speak = useCallback(
    async (force: boolean) => {
      const text = (script || "").trim() || t("scriptTestDefault");
      // 선택 룩을 렌더 대상(기본 룩)으로 맞춘 뒤 렌더한다.
      await onPrepareRender?.();
      preview.generate(voiceId, text, force);
    },
    [script, voiceId, preview, onPrepareRender, t],
  );

  if (!enabled || !look) return null;

  const processing = preview.status === "processing";
  const ready = preview.status === "ready" && !!preview.videoUrl;
  const failed = preview.status === "failed";

  return (
    <section data-testid="avatar-script-test" style={cardStyle}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={headingStyle}>{t("scriptTestTitle")}</h2>
        <p style={descStyle}>{t("scriptTestDescription")}</p>
      </div>

      <div style={gridStyle}>
        {/* 좌: 말하는 아바타 영상 */}
        <div style={{ minWidth: 0 }}>
          <div style={stageStyle}>
            {ready ? (
              <video
                key={preview.videoUrl ?? look.id}
                src={preview.videoUrl ?? undefined}
                poster={look.preview_image_url ?? undefined}
                controls
                autoPlay={!reducedMotion}
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
              <div data-testid="script-test-rendering" style={overlayStyle}>
                {t("scriptTestRendering")}
              </div>
            )}
          </div>
          <p style={captionStyle}>
            {look.name}
            {voiceName ? ` · ${voiceName}` : ""}
          </p>
        </div>

        {/* 우: 스크립트 입력(채팅) */}
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
          <h3 style={chatHeadingStyle}>{t("scriptTestChatTitle")}</h3>
          <p style={chatNoteStyle}>{t("scriptTestChatNote")}</p>

          <textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            maxLength={2000}
            rows={5}
            data-testid="script-test-input"
            placeholder={t("scriptTestPlaceholder")}
            style={textareaStyle}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => speak(false)}
              disabled={processing}
              data-testid="script-test-speak"
              style={{
                ...primaryBtn,
                opacity: processing ? 0.55 : 1,
                cursor: processing ? "wait" : "pointer",
              }}
            >
              {processing ? t("scriptTestRendering") : `▶ ${t("scriptTestSpeak")}`}
            </button>
            {ready && (
              <button
                type="button"
                onClick={() => speak(true)}
                disabled={processing}
                data-testid="script-test-respeak"
                style={ghostBtn}
              >
                {t("scriptTestRespeak")}
              </button>
            )}
          </div>

          {failed && (
            <p role="alert" style={errorHintStyle}>
              {preview.message || t("scriptTestFailed")}
            </p>
          )}
          <p style={changeHintStyle}>{t("scriptTestApplyHint")}</p>
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

const captionStyle: CSSProperties = {
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
