"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { Avatar } from "./avatarsTypes";
import { useScriptTestPreview } from "./useScriptTestPreview";

interface AvatarScriptTestProps {
  /** 현재 선택된 룩(아바타). 본인(사진) 아바타일 때만 인라인 렌더가 가능하다. */
  look: Avatar | null;
  /** "아바타 제작에 사용"으로 고른 음성 id. null = 미선택. */
  voiceId: string | null;
  /** 선택 음성 표시 이름(없으면 기본 보이스). */
  voiceName?: string | null;
  /** "룩과 목소리 아바타 제작"을 눌러 작업대가 열렸는지. false 면 렌더하지 않는다. */
  active: boolean;
  /** 제작 버튼을 누를 때마다 증가 — 변경되면 현재 스크립트로 렌더를 시작한다. */
  renderNonce: number;
  /** 강의 컨텍스트(?lecture=) — 있으면 "강의에 적용" 노출. */
  lectureId: string | null;
  applying: boolean;
  /** "이 아바타를 강의에 적용" — 룩+음성을 강의에 저장하고 편집기로 복귀. */
  onApplyToLecture: () => void;
  /**
   * 렌더 직전 준비 훅 — 선택한 룩을 me/preview 렌더 대상(기본 룩)으로 맞춘다.
   * 본인 룩(MyLook)이면 기본 룩으로 지정(select)한다. 완료될 때까지 await 한다.
   */
  onPrepareRender?: () => Promise<void>;
  reducedMotion: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * "아바타 제작 — 성능 확인" 작업대.
 *
 * 우측 상단 "룩과 목소리 아바타 제작"을 누르면 열려, 선택한 룩 + 음성으로 말하는
 * 아바타를 HeyGen 으로 그 자리에서 만든다(`me/preview`). 옆 채팅에 스크립트를 넣어
 * 성능을 확인하고(같은 음성·대본은 캐시로 즉시·비용 0), 만족하면 "이 아바타를
 * 강의에 적용"으로 강의의 Q&A 아바타(avatar_id+voice_id)로 저장한다 — 이후 학생
 * 질문은 야간 배치가 미리 렌더한 답변 클립(캐시)으로 즉시 재생된다(#336).
 *
 * 본인 룩(`is_custom`) + 음성이 모두 골라졌고 작업대가 열렸을 때만 렌더한다. 표준
 * HeyGen 아바타는 인라인 렌더 대상이 아니므로(Talking Photo 없음) 노출하지 않는다.
 */
export default function AvatarScriptTest({
  look,
  voiceId,
  voiceName,
  active,
  renderNonce,
  lectureId,
  applying,
  onApplyToLecture,
  onPrepareRender,
  reducedMotion,
  t,
}: AvatarScriptTestProps) {
  const enabled = active && !!look?.is_custom && !!voiceId;
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

  // 제작 버튼(renderNonce)을 누르면 현재 스크립트로 렌더를 시작한다.
  // nonce-동등 검사로, script 변경 등으로 effect 가 재실행돼도 중복 렌더하지 않는다.
  const lastNonceRef = useRef(0);
  useEffect(() => {
    if (!enabled || renderNonce === lastNonceRef.current) return;
    lastNonceRef.current = renderNonce;
    void speak(false);
  }, [renderNonce, enabled, speak]);

  if (!enabled || !look) return null;

  const processing = preview.status === "processing";
  const ready = preview.status === "ready" && !!preview.videoUrl;
  const failed = preview.status === "failed";

  return (
    <section data-testid="avatar-script-test" style={cardStyle}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={headingStyle}>{t("buildStudioTitle")}</h2>
        <p style={descStyle}>{t("buildStudioDescription")}</p>
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
          <p style={changeHintStyle}>{t("buildChangeHint")}</p>

          {/* 성능을 확인했으면 이 아바타를 강의의 Q&A 아바타로 적용한다. */}
          <div style={{ marginTop: "auto", paddingTop: 16 }}>
            {lectureId ? (
              <button
                type="button"
                onClick={onApplyToLecture}
                disabled={applying || !ready}
                data-testid="build-apply"
                style={{
                  ...applyBtn,
                  opacity: applying || !ready ? 0.5 : 1,
                  cursor: applying || !ready ? "not-allowed" : "pointer",
                }}
                title={!ready ? t("buildApplyNeedsRender") : undefined}
              >
                {applying ? t("applying") : t("buildApply")}
              </button>
            ) : (
              <p style={changeHintStyle}>{t("applyHintNoLecture")}</p>
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
