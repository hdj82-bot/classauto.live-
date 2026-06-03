"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { VoiceGender, VoiceOption } from "./voicePresets";

interface SampleVoicePickerProps {
  /** GET /api/voices 카탈로그(또는 합성 폴백). 본인 클론 음성도 여기에 포함된다. */
  voices: VoiceOption[];
  loading: boolean;
  /** 현재 강의에 적용할 음성 id. null = 기본 보이스(성별 기준). */
  selectedId: string | null;
  /** 음성 선택 — 부모가 "룩과 목소리 아바타 제작" 시 voice_id 로 적용한다. */
  onSelect: (id: string | null) => void;
  /** 본인 클론 음성 id — 목록에서 "내 목소리"로 강조한다. */
  ownVoiceId?: string | null;
  t: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * "샘플 목소리 선택" — 강의 영상 생성(스튜디오)에 있던 음성 선택을 옮겨온 박스.
 *
 * 위 "내 목소리로 음성 만들기"(VoiceCloneUploadCard)와 한 쌍을 이룬다: 교수자는
 * 본인 목소리(클론)나 ElevenLabs 샘플 보이스 중 하나를 골라 Q&A 아바타의 목소리로
 * 쓴다. 여기서 고른 voice_id 가 "룩과 목소리 아바타 제작"으로 강의에 적용되고,
 * 강의 영상·Q&A 답변이 같은 목소리로 발화하게 한다(강의 진행 목소리와 Q&A 목소리
 * 불일치 방지).
 *
 * 미리듣기는 보이스 "샘플"(previewUrl)을 ``new Audio`` 로 재생한다(CORS 안전·즉시·
 * 비용 0). previewUrl 이 없는 합성 폴백 보이스는 미리듣기를 비활성화한다.
 */
export default function SampleVoicePicker({
  voices,
  loading,
  selectedId,
  onSelect,
  ownVoiceId,
  t,
}: SampleVoicePickerProps) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingId(null);
  };

  // 언마운트 시 오디오 정리.
  useEffect(() => {
    return () => {
      if (audioRef.current) audioRef.current.pause();
    };
  }, []);

  const togglePreview = (v: VoiceOption) => {
    if (typeof window === "undefined" || !v.previewUrl) return;
    if (playingId === v.id) {
      stopAudio();
      return;
    }
    stopAudio();
    try {
      const audio = new Audio(v.previewUrl);
      audio.onended = () => setPlayingId((cur) => (cur === v.id ? null : cur));
      audioRef.current = audio;
      setPlayingId(v.id);
      void audio.play().catch(() => stopAudio());
    } catch {
      stopAudio();
    }
  };

  const males = voices.filter((v) => v.gender === "male");
  const females = voices.filter((v) => v.gender === "female");
  const genderLabel = (g: VoiceGender) =>
    g === "male" ? t("voiceGroupMale") : t("voiceGroupFemale");

  return (
    <section data-testid="sample-voice-picker" style={cardStyle}>
      <h2 style={headingStyle}>{t("sampleVoiceTitle")}</h2>
      <p style={descStyle}>{t("sampleVoiceDescription")}</p>

      {loading ? (
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: 0 }}>
          {t("voiceLoading")}
        </p>
      ) : (
        <div data-testid="sample-voice-list">
          {/* 기본 보이스(성별 기준) — voice_id 미지정 */}
          <button
            type="button"
            onClick={() => onSelect(null)}
            aria-pressed={selectedId === null}
            data-testid="sample-voice-option-default"
            style={rowStyle(selectedId === null)}
          >
            <span style={rowNameStyle(selectedId === null)}>
              {t("sampleVoiceDefault")}
            </span>
          </button>

          {(
            [
              ["male", males],
              ["female", females],
            ] as const
          ).map(([g, list]) =>
            list.length === 0 ? null : (
              <div key={g} style={{ marginTop: 12 }}>
                <span style={groupLabelStyle}>{genderLabel(g)}</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {list.map((v) => {
                    const active = v.id === selectedId;
                    const isOwn = !!ownVoiceId && v.id === ownVoiceId;
                    const isPlaying = playingId === v.id;
                    return (
                      <div
                        key={v.id}
                        style={{ display: "flex", alignItems: "center", gap: 6 }}
                      >
                        <button
                          type="button"
                          onClick={() => onSelect(v.id)}
                          aria-pressed={active}
                          data-testid={`sample-voice-option-${v.id}`}
                          style={{ ...rowStyle(active), flex: 1 }}
                        >
                          <span style={{ minWidth: 0 }}>
                            <span style={rowNameStyle(active)}>
                              {v.name}
                              {isOwn && (
                                <span style={myBadgeStyle}>{t("voiceMyBadge")}</span>
                              )}
                            </span>
                            {v.meta && (
                              <span style={rowMetaStyle(active)}>{v.meta}</span>
                            )}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => togglePreview(v)}
                          disabled={!v.previewUrl}
                          aria-label={t("voicePreviewListen")}
                          title={v.previewUrl ? t("voicePreviewListen") : "—"}
                          data-testid={`sample-voice-preview-${v.id}`}
                          style={previewBtnStyle(isPlaying, !!v.previewUrl)}
                        >
                          <span aria-hidden="true" style={{ fontSize: 12 }}>
                            {isPlaying ? "⏸" : "▶"}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </section>
  );
}

// ── 스타일 ────────────────────────────────────────────────────────────────────

const cardStyle: CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--line)",
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
  margin: "4px 0 16px",
  fontSize: 13,
  lineHeight: 1.6,
  color: "var(--text-muted)",
};

const groupLabelStyle: CSSProperties = {
  display: "block",
  margin: "0 0 6px",
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-faint)",
};

const myBadgeStyle: CSSProperties = {
  marginLeft: 8,
  fontSize: 10,
  fontWeight: 700,
  padding: "1px 7px",
  borderRadius: 4,
  background: "var(--gold-soft)",
  color: "var(--gold-on-light)",
  verticalAlign: "middle",
};

function rowStyle(active: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    width: "100%",
    textAlign: "left",
    padding: "9px 12px",
    borderRadius: 9,
    cursor: "pointer",
    fontFamily: "inherit",
    border: `1px solid ${active ? "var(--gold)" : "var(--line)"}`,
    background: active ? "var(--gold)" : "var(--bg-card)",
    transition:
      "border-color 120ms var(--ease-out), background 120ms var(--ease-out)",
  };
}

function rowNameStyle(active: boolean): CSSProperties {
  return {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    color: active ? "#0A0A0A" : "var(--text)",
  };
}

function rowMetaStyle(active: boolean): CSSProperties {
  return {
    display: "block",
    fontSize: 10.5,
    color: active ? "rgba(10,10,10,0.7)" : "var(--text-faint)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };
}

function previewBtnStyle(playing: boolean, enabled: boolean): CSSProperties {
  return {
    flexShrink: 0,
    display: "inline-grid",
    placeItems: "center",
    width: 32,
    height: 32,
    borderRadius: 8,
    border: "1px solid var(--line-strong)",
    background: playing ? "var(--gold-soft)" : "var(--bg-card)",
    color: "var(--gold-on-light)",
    cursor: enabled ? "pointer" : "not-allowed",
    opacity: enabled ? 1 : 0.4,
  };
}
