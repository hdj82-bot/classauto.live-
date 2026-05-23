"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { Avatar } from "./avatarsTypes";
import {
  getVoiceById,
  randomVoice,
  type VoiceGender,
  type VoiceOption,
} from "./voicePresets";
import { useVoicePreview } from "./useVoicePreview";
import { useCustomAvatarPreview } from "./useCustomAvatarPreview";

interface AvatarPreviewStageProps {
  /** 갤러리에서 선택(클릭)된 아바타. null 이면 안내 플레이스홀더. */
  avatar: Avatar | null;
  /** 사용 가능한 음성 목록 (실제 ElevenLabs 카탈로그 또는 합성 폴백). */
  voices: VoiceOption[];
  /** 음성 목록 로딩 중. */
  voicesLoading: boolean;
  /** prefers-reduced-motion — true 면 자동재생하지 않고 재생 버튼을 노출. */
  reducedMotion: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * 아바타 대형 미리보기 무대 + 음성 패널.
 *
 * 일반 HeyGen 아바타는 idle 미리보기 영상(muted)과 함께 음성 목록 중 하나를
 * 오버레이로 재생한다. 본인(사진) 아바타는 idle 영상이 없으므로, 사용자가
 * "움직이는 미리보기 만들기" 를 누르면 HeyGen 으로 짧은 말하는 영상을 1회 렌더해
 * (캐시) 그 영상을 음성과 함께 재생한다.
 */
export default function AvatarPreviewStage({
  avatar,
  voices,
  voicesLoading,
  reducedMotion,
  t,
}: AvatarPreviewStageProps) {
  const voice = useVoicePreview();
  const { play, stop, supported } = voice;
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [voiceId, setVoiceId] = useState<string | null>(null);

  const isCustom = !!avatar?.is_custom;
  const preview = useCustomAvatarPreview(isCustom);

  // 본인 렌더 클립은 음성이 입혀져 있어 그 자체 오디오로 재생한다.
  const isCustomRender =
    isCustom && preview.status === "ready" && !!preview.videoUrl;
  const effectiveVideoUrl = isCustom
    ? preview.videoUrl
    : (avatar?.preview_video_url ?? null);
  const hasVideo = !!effectiveVideoUrl;

  const [playing, setPlaying] = useState(false);

  // 최신 값을 effect 의존성에 넣지 않고 읽기 위한 ref.
  const voiceIdRef = useRef(voiceId);
  useEffect(() => {
    voiceIdRef.current = voiceId;
  }, [voiceId]);
  const voicesRef = useRef(voices);
  useEffect(() => {
    voicesRef.current = voices;
  }, [voices]);
  const lastAvatarIdRef = useRef<string | null>(null);

  const sampleText = t("voiceSampleText");

  const playVideo = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    try {
      const p = v.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {
      /* jsdom·자동재생 정책 거부 무시 */
    }
  }, []);

  const pauseVideo = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    try {
      v.pause();
    } catch {
      /* no-op */
    }
  }, []);

  const startPlayback = useCallback(
    (option: VoiceOption | null) => {
      playVideo();
      // 일반/오디션 상황에서만 음성 오버레이를 재생. 본인 렌더 클립은 자체 오디오.
      if (!isCustomRender && option && supported) {
        play(option, sampleText, true);
      }
      setPlaying(true);
    },
    [playVideo, play, supported, sampleText, isCustomRender],
  );

  const stopPlayback = useCallback(() => {
    pauseVideo();
    stop();
    setPlaying(false);
  }, [pauseVideo, stop]);

  // 새 아바타면 음성 랜덤 배정.
  useEffect(() => {
    if (!avatar) {
      lastAvatarIdRef.current = null;
      return;
    }
    const pool = voicesRef.current;
    if (pool.length === 0) return;
    const isNewAvatar = lastAvatarIdRef.current !== avatar.id;
    lastAvatarIdRef.current = avatar.id;
    const existing = getVoiceById(pool, voiceIdRef.current);
    if (isNewAvatar || !existing) {
      setVoiceId(randomVoice(pool)?.id ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatar?.id, voices.length]);

  // 영상/음성 재생: 아바타·렌더 영상·모드가 바뀌면 (재)시작.
  useEffect(() => {
    stop();
    setPlaying(false);
    if (!avatar) return;
    if (reducedMotion) return; // 자동재생 안 함 — 재생 버튼 대기.
    const option =
      getVoiceById(voicesRef.current, voiceIdRef.current) ??
      randomVoice(voicesRef.current);
    playVideo();
    if (!isCustomRender && option && supported) {
      play(option, sampleText, true);
    }
    setPlaying(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    avatar?.id,
    effectiveVideoUrl,
    isCustomRender,
    reducedMotion,
    sampleText,
    supported,
  ]);

  const handleSelectVoice = useCallback(
    (id: string) => {
      setVoiceId(id);
      // 본인 렌더가 이미 있으면 음성 변경은 "다시 만들기"로만 반영(비용).
      if (isCustomRender) return;
      const option = getVoiceById(voicesRef.current, id);
      if (option && avatar) startPlayback(option);
    },
    [avatar, startPlayback, isCustomRender],
  );

  const handleToggle = useCallback(() => {
    if (playing) {
      stopPlayback();
      return;
    }
    const option =
      getVoiceById(voicesRef.current, voiceIdRef.current) ??
      randomVoice(voicesRef.current);
    if (option) setVoiceId(option.id);
    startPlayback(option);
  }, [playing, stopPlayback, startPlayback]);

  const handleGenerate = useCallback(
    (force: boolean) => {
      preview.generate(voiceIdRef.current, force);
    },
    [preview],
  );

  const current = getVoiceById(voices, voiceId);
  const males = voices.filter((v) => v.gender === "male");
  const females = voices.filter((v) => v.gender === "female");
  const genderLabel = (g: VoiceGender) =>
    g === "male" ? t("genderMale") : t("genderFemale");

  return (
    <section
      data-testid="avatar-preview-stage"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--line)",
        borderRadius: 16,
        padding: 18,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
          gap: 18,
          alignItems: "stretch",
        }}
      >
        {/* ── 좌: 대형 영상 무대 ─────────────────────────────────────── */}
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 340,
              margin: "0 auto",
              aspectRatio: "3 / 4",
              borderRadius: 12,
              overflow: "hidden",
              background: "var(--bg-subtle)",
              border: "1px solid var(--line)",
            }}
          >
            {!avatar ? (
              <div
                data-testid="avatar-preview-empty"
                style={placeholderStyle}
              >
                {t("stagePlaceholder")}
              </div>
            ) : hasVideo ? (
              <video
                key={effectiveVideoUrl ?? avatar.id}
                ref={videoRef}
                src={effectiveVideoUrl ?? undefined}
                poster={avatar.preview_image_url ?? undefined}
                muted={!isCustomRender}
                loop
                playsInline
                preload="metadata"
                aria-label={avatar.name}
                style={mediaFillStyle}
              />
            ) : avatar.preview_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatar.preview_image_url}
                alt={avatar.name}
                style={mediaFillStyle}
              />
            ) : (
              <span aria-hidden="true" style={initialStyle}>
                {avatar.name.slice(0, 1)}
              </span>
            )}

            {/* 본인 아바타 렌더 진행 중 오버레이 */}
            {isCustom && preview.status === "processing" && (
              <div data-testid="avatar-preview-rendering" style={overlayStyle}>
                {t("previewGenerating")}
              </div>
            )}

            {avatar && playing && (
              <span style={playingBadgeStyle}>
                <span aria-hidden="true" style={playingDotStyle} />
                {t("stageNowPlaying")}
              </span>
            )}
          </div>

          {avatar && (
            <p style={avatarNameStyle}>{avatar.name}</p>
          )}

          {/* 본인 아바타: 움직이는 미리보기 컨트롤 */}
          {isCustom && (
            <div style={{ marginTop: 10, textAlign: "center" }}>
              {preview.status === "ready" ? (
                <button
                  type="button"
                  onClick={() => handleGenerate(true)}
                  data-testid="avatar-preview-regenerate"
                  style={secondaryControlStyle}
                >
                  {t("previewRegenerate")}
                </button>
              ) : preview.status === "processing" ? (
                <p style={previewHintStyle}>{t("previewGenerating")}</p>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => handleGenerate(false)}
                    data-testid="avatar-preview-generate"
                    style={primaryControlStyle}
                  >
                    {`▶ ${t("previewGenerate")}`}
                  </button>
                  <p style={previewHintStyle}>
                    {preview.status === "failed" && preview.message
                      ? preview.message
                      : t("stageCustomNoMotion")}
                  </p>
                  <p style={{ ...previewHintStyle, marginTop: 2 }}>
                    {t("previewGenerateNote")}
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── 우: 음성 패널 ─────────────────────────────────────────── */}
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
          <h3 style={voiceHeadingStyle}>{t("voiceHeading")}</h3>
          <p style={voiceNoteStyle}>
            {isCustomRender ? t("voiceNoteCustom") : t("voiceNote")}
          </p>

          {/* 현재 음성 표기 */}
          <div data-testid="avatar-voice-current" style={voiceCurrentStyle}>
            <span aria-hidden="true" style={{ fontSize: 15 }}>
              🔊
            </span>
            <span style={voiceCurrentLabelStyle}>
              {isCustomRender ? t("previewVoiceLabel") : t("voiceNowPlaying")}
            </span>
            <span style={voiceCurrentNameStyle}>
              {current
                ? `${current.name} · ${genderLabel(current.gender)}`
                : "—"}
            </span>
          </div>

          {/* 음성 목록 — 남/여 그룹, 많으면 스크롤 */}
          {voicesLoading ? (
            <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "4px 0" }}>
              {t("voiceLoading")}
            </p>
          ) : (
            <div data-testid="avatar-voice-list" style={voiceListStyle}>
              {(
                [
                  ["male", males],
                  ["female", females],
                ] as const
              ).map(([g, list]) =>
                list.length === 0 ? null : (
                  <div key={g} style={{ marginBottom: 10 }}>
                    <span style={voiceGroupLabelStyle}>
                      {g === "male" ? t("voiceGroupMale") : t("voiceGroupFemale")}
                    </span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {list.map((v) => {
                        const active = v.id === voiceId;
                        return (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => handleSelectVoice(v.id)}
                            aria-pressed={active}
                            data-testid={`avatar-voice-option-${v.id}`}
                            style={voiceRowStyle(active)}
                          >
                            <span style={{ minWidth: 0 }}>
                              <span style={voiceRowNameStyle(active)}>{v.name}</span>
                              {v.meta && (
                                <span style={voiceRowMetaStyle(active)}>{v.meta}</span>
                              )}
                            </span>
                            {active && playing && (
                              <span aria-hidden="true" style={{ fontSize: 12, flexShrink: 0 }}>
                                ♪
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ),
              )}
            </div>
          )}

          {/* 재생 컨트롤 */}
          <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
            <button
              type="button"
              onClick={handleToggle}
              disabled={!avatar || voices.length === 0}
              data-testid="avatar-voice-toggle"
              style={{
                ...primaryControlStyle,
                flex: 1,
                opacity: !avatar || voices.length === 0 ? 0.45 : 1,
                cursor: !avatar || voices.length === 0 ? "not-allowed" : "pointer",
              }}
            >
              {playing ? `⏸ ${t("voiceStop")}` : `▶ ${t("voicePlay")}`}
            </button>
          </div>

          {isCustomRender && (
            <p style={{ ...previewHintStyle, textAlign: "left", marginTop: 8 }}>
              {t("voiceChangeNeedsRerender")}
            </p>
          )}

          {!supported && (
            <p role="note" style={{ ...previewHintStyle, textAlign: "left", marginTop: 10 }}>
              {t("voiceUnsupported")}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

// ── 스타일 ────────────────────────────────────────────────────────────────────

const mediaFillStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const placeholderStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "grid",
  placeItems: "center",
  padding: 24,
  textAlign: "center",
  fontSize: 13,
  lineHeight: 1.6,
  color: "var(--text-muted)",
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

const playingBadgeStyle: CSSProperties = {
  position: "absolute",
  bottom: 8,
  left: 8,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "3px 9px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
  color: "#fff",
  background: "rgba(10,10,10,0.6)",
  backdropFilter: "blur(2px)",
};

const playingDotStyle: CSSProperties = {
  width: 7,
  height: 7,
  borderRadius: 999,
  background: "var(--gold)",
};

const avatarNameStyle: CSSProperties = {
  margin: "10px 0 0",
  textAlign: "center",
  fontSize: 14,
  fontWeight: 600,
  color: "var(--text)",
};

const previewHintStyle: CSSProperties = {
  margin: "6px auto 0",
  maxWidth: 320,
  textAlign: "center",
  fontSize: 11.5,
  lineHeight: 1.5,
  color: "var(--text-faint)",
};

const voiceHeadingStyle: CSSProperties = {
  margin: "0 0 4px",
  fontSize: 14,
  fontWeight: 700,
  color: "var(--text)",
};

const voiceNoteStyle: CSSProperties = {
  margin: "0 0 12px",
  fontSize: 12,
  lineHeight: 1.5,
  color: "var(--text-muted)",
};

const voiceCurrentStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 12px",
  borderRadius: 10,
  background: "var(--gold-soft)",
  border: "1px solid var(--gold-medium)",
  marginBottom: 12,
};

const voiceCurrentLabelStyle: CSSProperties = {
  fontSize: 11.5,
  color: "var(--gold-on-light)",
  fontWeight: 600,
  flexShrink: 0,
};

const voiceCurrentNameStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "var(--text)",
  marginLeft: "auto",
  textAlign: "right",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const voiceListStyle: CSSProperties = {
  maxHeight: 240,
  overflowY: "auto",
  paddingRight: 4,
  marginBottom: 12,
};

const voiceGroupLabelStyle: CSSProperties = {
  display: "block",
  margin: "0 0 6px",
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-faint)",
};

function voiceRowStyle(active: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    width: "100%",
    textAlign: "left",
    padding: "7px 10px",
    borderRadius: 9,
    cursor: "pointer",
    fontFamily: "inherit",
    border: `1px solid ${active ? "var(--gold)" : "var(--line)"}`,
    background: active ? "var(--gold)" : "var(--bg-card)",
    transition:
      "border-color 120ms var(--ease-out), background 120ms var(--ease-out)",
  };
}

function voiceRowNameStyle(active: boolean): CSSProperties {
  return {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    color: active ? "#0A0A0A" : "var(--text)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };
}

function voiceRowMetaStyle(active: boolean): CSSProperties {
  return {
    display: "block",
    fontSize: 10.5,
    color: active ? "rgba(10,10,10,0.7)" : "var(--text-faint)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };
}

const primaryControlStyle: CSSProperties = {
  padding: "9px 16px",
  fontSize: 13,
  fontWeight: 700,
  borderRadius: 10,
  border: "1px solid transparent",
  background: "linear-gradient(135deg, #FFB627, #E89E0E)",
  color: "#0A0A0A",
  fontFamily: "inherit",
  cursor: "pointer",
};

const secondaryControlStyle: CSSProperties = {
  padding: "8px 14px",
  fontSize: 12.5,
  fontWeight: 600,
  borderRadius: 10,
  border: "1px solid var(--line-strong)",
  background: "var(--bg-card)",
  color: "var(--text)",
  fontFamily: "inherit",
  cursor: "pointer",
};
