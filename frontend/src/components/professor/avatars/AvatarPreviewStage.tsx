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
  VOICE_PRESETS,
  getVoicePreset,
  randomVoicePreset,
  type VoicePreset,
} from "./voicePresets";
import { useVoicePreview } from "./useVoicePreview";

interface AvatarPreviewStageProps {
  /** 갤러리에서 선택(클릭)된 아바타. null 이면 안내 플레이스홀더. */
  avatar: Avatar | null;
  /** prefers-reduced-motion — true 면 자동재생하지 않고 재생 버튼을 노출. */
  reducedMotion: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * 아바타 대형 미리보기 무대 + 음성 패널.
 *
 * 갤러리에서 아바타를 클릭하면 여기서 크게 재생되고(영상은 muted), 남/여 음성 중
 * 하나가 랜덤으로 함께 재생된다. 사용자는 우측 패널에서 음성을 바꿔 아바타 샘플과
 * 함께 들어볼 수 있다. 실제 프레임 단위 립싱크는 렌더 시점(HeyGen+voice)에
 * 이뤄지며, 여기서는 "이 음성으로 말하는" 느낌을 미리 들려주는 미리보기다.
 */
export default function AvatarPreviewStage({
  avatar,
  reducedMotion,
  t,
}: AvatarPreviewStageProps) {
  const voice = useVoicePreview();
  const { play, stop, supported } = voice;
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [voiceId, setVoiceId] = useState<string>(() => randomVoicePreset().id);
  const [playing, setPlaying] = useState(false);

  // 최신 voiceId 를 effect 의존성에 넣지 않고 읽기 위한 ref.
  const voiceIdRef = useRef(voiceId);
  useEffect(() => {
    voiceIdRef.current = voiceId;
  }, [voiceId]);
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
    (preset: VoicePreset) => {
      playVideo();
      if (supported) play(preset, sampleText, true);
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
    const isNewAvatar = lastAvatarIdRef.current !== avatar.id;
    lastAvatarIdRef.current = avatar.id;

    let preset = getVoicePreset(voiceIdRef.current);
    if (isNewAvatar || !preset) {
      preset = randomVoicePreset();
      setVoiceId(preset.id);
    }

    if (reducedMotion) return; // 자동재생 안 함.
    playVideo();
    if (supported) {
      play(preset, sampleText, true);
      setPlaying(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatar?.id, reducedMotion, sampleText, supported]);

  const handleSelectVoice = useCallback(
    (id: string) => {
      setVoiceId(id);
      const preset = getVoicePreset(id);
      if (preset && avatar) startPlayback(preset);
    },
    [avatar, startPlayback],
  );

  const handleToggle = useCallback(() => {
    if (playing) {
      stopPlayback();
      return;
    }
    const preset = getVoicePreset(voiceIdRef.current) ?? randomVoicePreset();
    startPlayback(preset);
  }, [playing, stopPlayback, startPlayback]);

  const current = getVoicePreset(voiceId);
  const genderLabel = (g: VoicePreset["gender"]) =>
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
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))",
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
              marginBottom: 14,
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 15 }}>
              🔊
            </span>
            <span style={{ fontSize: 11.5, color: "var(--gold-on-light)", fontWeight: 600 }}>
              {t("voiceNowPlaying")}
            </span>
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "var(--text)",
                marginLeft: "auto",
              }}
            >
              {current ? `${current.name} · ${genderLabel(current.gender)}` : "—"}
            </span>
          </div>

          {/* 음성 선택 — 남/여 그룹 */}
          {(["male", "female"] as const).map((g) => (
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
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {VOICE_PRESETS.filter((v) => v.gender === g).map((v) => {
                  const active = v.id === voiceId;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => handleSelectVoice(v.id)}
                      aria-pressed={active}
                      data-testid={`avatar-voice-option-${v.id}`}
                      style={voicePillStyle(active)}
                    >
                      {v.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* 재생 컨트롤 */}
          <div
            style={{
              display: "flex",
              gap: 8,
              marginTop: "auto",
              paddingTop: 12,
            }}
          >
            <button
              type="button"
              onClick={handleToggle}
              disabled={!avatar}
              data-testid="avatar-voice-toggle"
              style={{
                ...primaryControlStyle,
                opacity: !avatar ? 0.45 : 1,
                cursor: !avatar ? "not-allowed" : "pointer",
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

function voicePillStyle(active: boolean): CSSProperties {
  return {
    padding: "5px 12px",
    fontSize: 12.5,
    fontWeight: 600,
    borderRadius: 999,
    cursor: "pointer",
    fontFamily: "inherit",
    border: `1px solid ${active ? "var(--gold)" : "var(--line-strong)"}`,
    background: active ? "var(--gold)" : "var(--bg-card)",
    color: active ? "#0A0A0A" : "var(--text-muted)",
    transition: "border-color 120ms var(--ease-out), background 120ms var(--ease-out)",
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
