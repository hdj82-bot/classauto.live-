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
 * 갤러리에서 아바타를 클릭하면 여기서 크게 재생되고(영상은 muted), 음성 목록 중
 * 하나가 랜덤으로 함께 재생된다. 사용자는 우측 패널에서 음성을 바꿔 아바타 샘플과
 * 함께 들어볼 수 있다. 실제 프레임 단위 립싱크는 렌더 시점(HeyGen+voice)에
 * 이뤄지며, 여기서는 "이 음성으로 말하는" 느낌을 미리 들려주는 미리보기다.
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
  const hasVideo = !!avatar?.preview_video_url;

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
    (option: VoiceOption) => {
      playVideo();
      if (supported) play(option, sampleText, true);
      setPlaying(true);
    },
    [playVideo, play, supported, sampleText],
  );

  const stopPlayback = useCallback(() => {
    pauseVideo();
    stop();
    setPlaying(false);
  }, [pauseVideo, stop]);

  // 아바타가 바뀌면: 새 아바타면 음성 랜덤 배정 → 영상+음성 함께 재생.
  // reducedMotion 환경에서는 자동재생 없이 재생 버튼을 기다린다.
  useEffect(() => {
    stop();
    setPlaying(false);
    if (!avatar) {
      lastAvatarIdRef.current = null;
      return;
    }
    const pool = voicesRef.current;
    if (pool.length === 0) return; // 음성 목록 아직 로딩 전.

    const isNewAvatar = lastAvatarIdRef.current !== avatar.id;
    lastAvatarIdRef.current = avatar.id;

    let option = getVoiceById(pool, voiceIdRef.current);
    if (isNewAvatar || !option) {
      option = randomVoice(pool);
      setVoiceId(option?.id ?? null);
    }
    if (!option) return;

    if (reducedMotion) return; // 자동재생 안 함.
    playVideo();
    if (supported) {
      play(option, sampleText, true);
      setPlaying(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatar?.id, reducedMotion, sampleText, supported, voices.length]);

  const handleSelectVoice = useCallback(
    (id: string) => {
      setVoiceId(id);
      const option = getVoiceById(voicesRef.current, id);
      if (option && avatar) startPlayback(option);
    },
    [avatar, startPlayback],
  );

  const handleToggle = useCallback(() => {
    if (playing) {
      stopPlayback();
      return;
    }
    const option =
      getVoiceById(voicesRef.current, voiceIdRef.current) ??
      randomVoice(voicesRef.current);
    if (option) {
      setVoiceId(option.id);
      startPlayback(option);
    }
  }, [playing, stopPlayback, startPlayback]);

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
          // 영상 무대 + 음성 패널. 넓으면 2열, 좁으면 자동 줄바꿈.
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
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "grid",
                  placeItems: "center",
                  padding: 24,
                  textAlign: "center",
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: "var(--text-muted)",
                }}
              >
                {t("stagePlaceholder")}
              </div>
            ) : hasVideo ? (
              <video
                key={avatar.id}
                ref={videoRef}
                src={avatar.preview_video_url ?? undefined}
                poster={avatar.preview_image_url ?? undefined}
                muted
                loop
                playsInline
                preload="metadata"
                aria-label={avatar.name}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />
            ) : avatar.preview_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatar.preview_image_url}
                alt={avatar.name}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />
            ) : (
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "grid",
                  placeItems: "center",
                  fontSize: 64,
                  fontWeight: 700,
                  color: "var(--text-faint)",
                }}
              >
                {avatar.name.slice(0, 1)}
              </span>
            )}

            {avatar && playing && (
              <span
                style={{
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
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 999,
                    background: "var(--gold)",
                  }}
                />
                {t("stageNowPlaying")}
              </span>
            )}
          </div>

          {avatar && (
            <p
              style={{
                margin: "10px 0 0",
                textAlign: "center",
                fontSize: 14,
                fontWeight: 600,
                color: "var(--text)",
              }}
            >
              {avatar.name}
            </p>
          )}

          {/* 본인(사진) 아바타는 미리보기 영상이 없어 정지 이미지로 표시 */}
          {avatar && !hasVideo && avatar.is_custom && (
            <p
              data-testid="avatar-stage-no-motion"
              style={{
                margin: "6px auto 0",
                maxWidth: 320,
                textAlign: "center",
                fontSize: 11.5,
                lineHeight: 1.5,
                color: "var(--text-faint)",
              }}
            >
              {t("stageCustomNoMotion")}
            </p>
          )}
        </div>

        {/* ── 우: 음성 패널 ─────────────────────────────────────────── */}
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
          <h3
            style={{
              margin: "0 0 4px",
              fontSize: 14,
              fontWeight: 700,
              color: "var(--text)",
            }}
          >
            {t("voiceHeading")}
          </h3>
          <p
            style={{
              margin: "0 0 12px",
              fontSize: 12,
              lineHeight: 1.5,
              color: "var(--text-muted)",
            }}
          >
            {t("voiceNote")}
          </p>

          {/* 현재 재생 중인 음성 표기 */}
          <div
            data-testid="avatar-voice-current"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderRadius: 10,
              background: "var(--gold-soft)",
              border: "1px solid var(--gold-medium)",
              marginBottom: 12,
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 15 }}>
              🔊
            </span>
            <span
              style={{
                fontSize: 11.5,
                color: "var(--gold-on-light)",
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              {t("voiceNowPlaying")}
            </span>
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "var(--text)",
                marginLeft: "auto",
                textAlign: "right",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
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
            <div
              data-testid="avatar-voice-list"
              style={{
                maxHeight: 240,
                overflowY: "auto",
                paddingRight: 4,
                marginBottom: 12,
              }}
            >
              {(
                [
                  ["male", males],
                  ["female", females],
                ] as const
              ).map(([g, list]) =>
                list.length === 0 ? null : (
                  <div key={g} style={{ marginBottom: 10 }}>
                    <span
                      style={{
                        display: "block",
                        margin: "0 0 6px",
                        fontSize: 10.5,
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: "var(--text-faint)",
                      }}
                    >
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
                              <span
                                style={{
                                  display: "block",
                                  fontSize: 13,
                                  fontWeight: 600,
                                  color: active ? "#0A0A0A" : "var(--text)",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {v.name}
                              </span>
                              {v.meta && (
                                <span
                                  style={{
                                    display: "block",
                                    fontSize: 10.5,
                                    color: active
                                      ? "rgba(10,10,10,0.7)"
                                      : "var(--text-faint)",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {v.meta}
                                </span>
                              )}
                            </span>
                            {active && playing && (
                              <span
                                aria-hidden="true"
                                style={{ fontSize: 12, flexShrink: 0 }}
                              >
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
                opacity: !avatar || voices.length === 0 ? 0.45 : 1,
                cursor: !avatar || voices.length === 0 ? "not-allowed" : "pointer",
              }}
            >
              {playing ? `⏸ ${t("voiceStop")}` : `▶ ${t("voicePlay")}`}
            </button>
          </div>

          {!supported && (
            <p
              role="note"
              style={{
                margin: "10px 0 0",
                fontSize: 11.5,
                lineHeight: 1.5,
                color: "var(--text-faint)",
              }}
            >
              {t("voiceUnsupported")}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

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

const primaryControlStyle: CSSProperties = {
  flex: 1,
  padding: "9px 16px",
  fontSize: 13,
  fontWeight: 700,
  borderRadius: 10,
  border: "1px solid transparent",
  background: "linear-gradient(135deg, #FFB627, #E89E0E)",
  color: "#0A0A0A",
  fontFamily: "inherit",
};
