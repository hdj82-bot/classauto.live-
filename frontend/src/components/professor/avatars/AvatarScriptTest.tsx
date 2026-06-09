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
  /**
   * "이 아바타 저장" — 현재 룩 + 음성 조합을 갤러리에 저장한다. 방금 렌더한
   * 미리보기 영상이 ready 면 함께 넘겨 갤러리 카드에서 바로 재생되게 한다.
   * 제공되지 않으면 저장 버튼을 숨긴다.
   */
  onSaveAvatar?: (previewVideoUrl: string | null) => void;
  /** 저장 진행 중(버튼 비활성·라벨). */
  saving?: boolean;
  reducedMotion: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}

// 진행률(의사) 추정 기준 — %는 안심 신호용.
//  - 포토 아바타(Talking Photo): 보통 30~90초.
//  - 표준 아바타(Video Avatar): HeyGen 렌더가 훨씬 길어 보통 2~4분. 75초로 잡으면
//    95%에 일찍 도달해 "무한 로딩"처럼 보였다(2026-06-09 사용자 피드백: ~200초).
//    종류별 추정치를 달리해 막대가 실제 시간에 맞춰 천천히 차도록 한다.
const ESTIMATED_RENDER_SECONDS_PHOTO = 75;
const ESTIMATED_RENDER_SECONDS_STANDARD = 210;

/**
 * "아바타 제작 — 성능 확인" 작업대.
 *
 * 우측 상단 "룩과 목소리 아바타 제작"을 누르면 열려, 선택한 룩 + 음성으로 말하는
 * 아바타를 HeyGen 으로 그 자리에서 만든다(`me/preview`). 아래 채팅에 스크립트를 넣어
 * 성능을 확인하고(같은 음성·대본은 캐시로 즉시·비용 0), 만족하면 "이 아바타를
 * 강의에 적용"으로 강의의 Q&A 아바타(avatar_id+voice_id)로 저장한다.
 *
 * 레이아웃(2026-06-05 사용자 피드백): 가로 16:9 영상을 **위에 크게**, 스크립트 입력과
 * "강의에 적용"은 **그 아래**에 둔다(이전 세로 크롭 + 좌우 2단으로 영상이 좁던 문제
 * 해소). 제작 중에는 진행률 바·%·경과 시간을 표시하고(무반응 체감 제거), 작업대가
 * 열리면 화면에 보이도록 스크롤한다(이전엔 페이지 맨 아래에서 열려 안 보였음).
 *
 * 본인 룩(`is_custom`) + 음성이 모두 골라졌고 작업대가 열렸을 때만 렌더한다.
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
  onSaveAvatar,
  saving,
  reducedMotion,
  t,
}: AvatarScriptTestProps) {
  // 포토 아바타(Talking Photo)와 표준 아바타(Video Avatar) 모두 인라인 렌더 가능.
  // 표준이면 avatar_id 로, 포토면 talking_photo 로 me/preview 가 렌더한다.
  const enabled = active && !!look?.is_custom && !!voiceId;
  const preview = useScriptTestPreview(enabled);
  const [script, setScript] = useState(() => t("scriptTestDefault"));
  const sectionRef = useRef<HTMLElement | null>(null);

  const speak = useCallback(
    async (force: boolean) => {
      const text = (script || "").trim() || t("scriptTestDefault");
      // 표준 아바타면 그 avatar_id 로 렌더(없으면 포토 아바타 기본 경로).
      const avatarId = look?.kind === "standard" ? look.id : null;
      // 선택 룩을 렌더 대상(기본 룩)으로 맞춘 뒤 렌더한다(포토 룩일 때만 의미).
      await onPrepareRender?.();
      preview.generate(voiceId, text, force, avatarId);
    },
    [script, voiceId, preview, onPrepareRender, look, t],
  );

  // 제작 버튼(renderNonce)을 누르면 현재 스크립트로 렌더를 시작한다.
  // nonce-동등 검사로, script 변경 등으로 effect 가 재실행돼도 중복 렌더하지 않는다.
  const lastNonceRef = useRef(0);
  useEffect(() => {
    if (!enabled || renderNonce === lastNonceRef.current) return;
    lastNonceRef.current = renderNonce;
    void speak(false);
  }, [renderNonce, enabled, speak]);

  // 작업대가 열리면(제작 클릭) 화면에 보이도록 스크롤 — 페이지 하단에서 열려
  // "아무 반응 없음"으로 보이던 문제를 해소한다.
  useEffect(() => {
    if (!enabled || !active) return;
    const el = sectionRef.current;
    // jsdom 등 scrollIntoView 미구현 환경 가드(테스트 안전).
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start",
      });
    }
  }, [enabled, active, renderNonce, reducedMotion]);

  const processing = preview.status === "processing";

  // 진행률(의사) — HeyGen 이 실제 %를 주지 않으므로 경과 초(elapsed)로 추정해 안심
  // 신호를 준다. 95% 에서 멈춰(완료 전 100% 오인 방지) 완료 시 영상으로 대체된다.
  // 제약: effect 본문 동기 setState 금지(react-hooks/set-state-in-effect) + 렌더 중
  // Date.now() 같은 불순 호출 금지(react-hooks/purity). → 0 리셋은 rAF 로 한 프레임
  // 미뤄 비동기화하고, 증가는 1초 interval 콜백에서만 한다(둘 다 effect 본문 밖).
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!processing) return;
    const raf = requestAnimationFrame(() => setElapsed(0));
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(id);
    };
  }, [processing]);
  // 표준 아바타(Video Avatar)는 렌더가 길어 추정치를 크게 잡는다(막대가 천천히 참).
  const isStandard = look?.kind === "standard";
  const estimatedSeconds = isStandard
    ? ESTIMATED_RENDER_SECONDS_STANDARD
    : ESTIMATED_RENDER_SECONDS_PHOTO;
  const percent = Math.min(
    95,
    Math.round((elapsed / estimatedSeconds) * 100),
  );

  if (!enabled || !look) return null;

  const ready = preview.status === "ready" && !!preview.videoUrl;
  const failed = preview.status === "failed";

  return (
    <section ref={sectionRef} data-testid="avatar-script-test" style={cardStyle}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={headingStyle}>{t("buildStudioTitle")}</h2>
        <p style={descStyle}>{t("buildStudioDescription")}</p>
      </div>

      {/* 위: 말하는 아바타 영상 — 가로 16:9 크게 */}
      <div>
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
              <div style={overlayTitleStyle}>{t("scriptTestRendering")}</div>
              <div style={progressTrackStyle}>
                <div style={{ ...progressBarStyle, width: `${percent}%` }} />
              </div>
              <div style={progressLabelStyle}>
                {percent}% · {elapsed}s
              </div>
              <div style={progressHintStyle}>
                {t(
                  isStandard
                    ? "scriptTestRenderingHintStandard"
                    : "scriptTestRenderingHint",
                )}
              </div>
            </div>
          )}
        </div>
        <p style={captionStyle}>
          {look.name}
          {voiceName ? ` · ${voiceName}` : ""}
        </p>
      </div>

      {/* 아래: 스크립트 입력(채팅) + 강의 적용 */}
      <div style={belowStyle}>
        <h3 style={chatHeadingStyle}>{t("scriptTestChatTitle")}</h3>
        <p style={chatNoteStyle}>{t("scriptTestChatNote")}</p>

        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          maxLength={2000}
          rows={4}
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
            {processing ? `${t("scriptTestRendering")} ${percent}%` : `▶ ${t("scriptTestSpeak")}`}
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
          {/* 룩 + 음성 조합을 갤러리에 저장 — ready 영상이 있으면 함께 넘긴다. */}
          {onSaveAvatar && (
            <button
              type="button"
              onClick={() => onSaveAvatar(ready ? preview.videoUrl : null)}
              disabled={!!saving || processing}
              data-testid="script-test-save"
              style={{
                ...ghostBtn,
                opacity: saving || processing ? 0.55 : 1,
                cursor: saving ? "wait" : processing ? "not-allowed" : "pointer",
              }}
            >
              {saving ? t("savingAvatar") : t("saveThisAvatar")}
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
        <div style={{ marginTop: 16 }}>
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

// 가로 16:9 영상 — 위쪽에 크게. 세로 크롭(이전 3/4)으로 좁아 보이던 문제 해소.
const stageStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  maxWidth: 760,
  margin: "0 auto",
  aspectRatio: "16 / 9",
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
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 4,
  padding: 24,
  textAlign: "center",
  color: "#fff",
  background: "rgba(10,10,10,0.55)",
  backdropFilter: "blur(2px)",
};

const overlayTitleStyle: CSSProperties = {
  fontSize: 13.5,
  fontWeight: 700,
};

const progressTrackStyle: CSSProperties = {
  width: "70%",
  maxWidth: 300,
  height: 6,
  marginTop: 12,
  borderRadius: 999,
  background: "rgba(255,255,255,0.25)",
  overflow: "hidden",
};

const progressBarStyle: CSSProperties = {
  height: "100%",
  borderRadius: 999,
  background: "linear-gradient(90deg, #FFB627, #E89E0E)",
  transition: "width 0.4s ease-out",
};

const progressLabelStyle: CSSProperties = {
  marginTop: 8,
  fontSize: 13,
  fontWeight: 700,
  fontVariantNumeric: "tabular-nums",
};

const progressHintStyle: CSSProperties = {
  marginTop: 4,
  fontSize: 11.5,
  lineHeight: 1.5,
  opacity: 0.85,
};

const captionStyle: CSSProperties = {
  margin: "10px 0 0",
  textAlign: "center",
  fontSize: 13,
  fontWeight: 600,
  color: "var(--text)",
};

// 아래 영역 — 영상과 같은 폭(760)으로 가운데 정렬해 읽기 좋게.
const belowStyle: CSSProperties = {
  maxWidth: 760,
  margin: "18px auto 0",
  display: "flex",
  flexDirection: "column",
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
  maxWidth: 420,
  padding: "12px 18px",
  fontSize: 14,
  fontWeight: 700,
  borderRadius: 12,
  border: "1px solid transparent",
  background: "linear-gradient(135deg, #FFB627, #E89E0E)",
  color: "#0A0A0A",
  fontFamily: "inherit",
};
