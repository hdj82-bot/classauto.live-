"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import type { VoiceGender, VoiceOption } from "./voicePresets";
import { setVoiceFavorite } from "./voicesApi";

interface SampleVoicePickerProps {
  /** GET /api/voices 카탈로그(또는 합성 폴백). 본인 클론 음성도 포함될 수 있다. */
  voices: VoiceOption[];
  loading: boolean;
  /** 현재 "아바타 제작에 사용" 으로 고른 음성 id. null = 아무것도 선택 안 함. */
  selectedId: string | null;
  /** 음성 사용 토글 — 같은 id 재선택은 부모가 해제(null)로 처리한다(상호 배타). */
  onSelect: (id: string) => void;
  /** 본인 클론 음성 id — 위 "내 목소리" 박스와 중복이므로 목록에서 제외한다. */
  ownVoiceId?: string | null;
  t: (key: string, params?: Record<string, string | number>) => string;
}

// 합성 폴백 보이스(id 가 "tts-" 로 시작)는 백엔드에 없어 즐겨찾기를 호출하지 않는다.
const isBackendVoice = (id: string) => !id.startsWith("tts-");

/**
 * "샘플 목소리 선택" — 스튜디오 "음성과 자막"의 ElevenLabs 보이스 선택 기능을
 * 가져온 박스(검색·즐겨찾기·미리듣기 + "이 음성을 아바타 제작에 사용").
 *
 * 위 "내 목소리로 음성 만들기" 박스와 한 쌍을 이루며, 본인 목소리 또는 샘플 보이스
 * 중 **하나만** 아바타 제작에 쓸 수 있다(상호 배타 — 단일 selectedId 로 표현).
 * 본인 클론 음성은 위 박스에 이미 있으므로 이 목록에선 제외한다(ownVoiceId).
 *
 * 미리듣기는 보이스 "샘플"(previewUrl)을 ``new Audio`` 로 재생한다(즉시·비용 0).
 * previewUrl 이 없는 합성 폴백 보이스는 미리듣기를 비활성화한다.
 */
export default function SampleVoicePicker({
  voices,
  loading,
  selectedId,
  onSelect,
  ownVoiceId,
  t,
}: SampleVoicePickerProps) {
  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  // 즐겨찾기 낙관적 override (백엔드 favorite 위에 사용자가 토글한 값을 덮어쓴다).
  const [favOverrides, setFavOverrides] = useState<Map<string, boolean>>(
    new Map(),
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingId(null);
  };

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

  const isFav = (v: VoiceOption): boolean => {
    const o = favOverrides.get(v.id);
    return o !== undefined ? o : !!v.favorite;
  };

  const toggleFavorite = async (v: VoiceOption) => {
    if (!isBackendVoice(v.id)) return;
    const next = !isFav(v);
    setFavOverrides((prev) => new Map(prev).set(v.id, next));
    try {
      await setVoiceFavorite(v.id, next);
    } catch {
      setFavOverrides((prev) => new Map(prev).set(v.id, !next)); // 롤백
    }
  };

  // 본인 클론 음성 제외 → 검색/즐겨찾기 필터 → 성별 그룹.
  const { males, females, total } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = voices.filter((v) => !ownVoiceId || v.id !== ownVoiceId);
    const filtered = base.filter((v) => {
      const fav =
        favOverrides.get(v.id) !== undefined
          ? favOverrides.get(v.id)!
          : !!v.favorite;
      if (favoritesOnly && !fav) return false;
      if (!q) return true;
      return (
        v.name.toLowerCase().includes(q) ||
        (v.meta ?? "").toLowerCase().includes(q)
      );
    });
    return {
      males: filtered.filter((v) => v.gender === "male"),
      females: filtered.filter((v) => v.gender === "female"),
      total: filtered.length,
    };
  }, [voices, ownVoiceId, query, favoritesOnly, favOverrides]);

  const genderLabel = (g: VoiceGender) =>
    g === "male" ? t("voiceGroupMale") : t("voiceGroupFemale");

  const renderRow = (v: VoiceOption) => {
    const active = v.id === selectedId;
    const isPlaying = playingId === v.id;
    const fav = isFav(v);
    return (
      <div
        key={v.id}
        data-testid={`sample-voice-option-${v.id}`}
        style={rowCardStyle(active)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={rowNameStyle}>{v.name}</span>
            {v.meta && <span style={rowMetaStyle}>{v.meta}</span>}
          </span>

          {isBackendVoice(v.id) && (
            <button
              type="button"
              onClick={() => toggleFavorite(v)}
              aria-pressed={fav}
              aria-label={fav ? t("favoriteRemove") : t("favoriteAdd")}
              title={fav ? t("favoriteRemove") : t("favoriteAdd")}
              data-testid={`sample-voice-fav-${v.id}`}
              style={iconBtnStyle(fav)}
            >
              {fav ? "★" : "☆"}
            </button>
          )}

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

        {/* 이 음성을 아바타 제작에 사용 (토글, 본인 목소리와 상호 배타) */}
        <button
          type="button"
          onClick={() => onSelect(v.id)}
          aria-pressed={active}
          data-testid={`sample-voice-use-${v.id}`}
          style={avatarUseBtnStyle(active)}
        >
          {active ? t("usingForAvatar") : t("useForAvatar")}
        </button>
      </div>
    );
  };

  return (
    <section data-testid="sample-voice-picker" style={cardStyle}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <h2 style={headingStyle}>{t("sampleVoiceTitle")}</h2>
        <Link href="/professor/voices" style={moreLinkStyle}>
          {t("moreVoices")}
        </Link>
      </div>
      <p style={descStyle}>{t("sampleVoiceDescription")}</p>

      {/* 검색 + 즐겨찾기만 보기 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 14,
        }}
      >
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("voiceSearch")}
          aria-label={t("voiceSearch")}
          data-testid="sample-voice-search"
          style={searchStyle}
        />
        <label style={favOnlyLabelStyle}>
          <input
            type="checkbox"
            checked={favoritesOnly}
            onChange={(e) => setFavoritesOnly(e.target.checked)}
            data-testid="sample-voice-fav-only"
            style={{ accentColor: "var(--gold-on-light)" }}
          />
          {t("favoritesOnly")}
        </label>
      </div>

      {loading ? (
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: 0 }}>
          {t("voiceLoading")}
        </p>
      ) : total === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: 0 }}>
          {favoritesOnly ? t("sampleVoiceFavEmpty") : t("sampleVoiceSearchEmpty")}
        </p>
      ) : (
        <div data-testid="sample-voice-list" style={listStyle}>
          {(
            [
              ["male", males],
              ["female", females],
            ] as const
          ).map(([g, list]) =>
            list.length === 0 ? null : (
              <div key={g} style={{ marginBottom: 14 }}>
                <span style={groupLabelStyle}>{genderLabel(g)}</span>
                <div style={{ display: "grid", gap: 8 }}>{list.map(renderRow)}</div>
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

const moreLinkStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--gold-on-light)",
  textDecoration: "none",
};

const descStyle: CSSProperties = {
  margin: "4px 0 14px",
  fontSize: 13,
  lineHeight: 1.6,
  color: "var(--text-muted)",
};

const searchStyle: CSSProperties = {
  flex: 1,
  minWidth: 200,
  padding: "9px 12px",
  fontSize: 13,
  borderRadius: 9,
  border: "1px solid var(--line-strong)",
  background: "var(--bg)",
  color: "var(--text)",
  fontFamily: "inherit",
  outline: "none",
};

const favOnlyLabelStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12.5,
  fontWeight: 500,
  color: "var(--text-subtle)",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const listStyle: CSSProperties = {
  maxHeight: 420,
  overflowY: "auto",
  paddingRight: 4,
};

const groupLabelStyle: CSSProperties = {
  display: "block",
  margin: "0 0 8px",
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-faint)",
};

function rowCardStyle(active: boolean): CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: "10px 12px",
    borderRadius: 11,
    border: `1px solid ${active ? "var(--gold)" : "var(--line)"}`,
    background: active ? "var(--gold-soft)" : "var(--bg-card)",
    transition:
      "border-color 120ms var(--ease-out), background 120ms var(--ease-out)",
  };
}

const rowNameStyle: CSSProperties = {
  display: "block",
  fontSize: 13.5,
  fontWeight: 600,
  color: "var(--text)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const rowMetaStyle: CSSProperties = {
  display: "block",
  fontSize: 11,
  color: "var(--text-faint)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

function iconBtnStyle(active: boolean): CSSProperties {
  return {
    flexShrink: 0,
    display: "inline-grid",
    placeItems: "center",
    width: 30,
    height: 30,
    borderRadius: 8,
    border: "1px solid var(--line-strong)",
    background: active ? "var(--gold-soft)" : "var(--bg-card)",
    color: active ? "var(--gold-on-light)" : "var(--text-faint)",
    cursor: "pointer",
    fontSize: 14,
    lineHeight: 1,
  };
}

function previewBtnStyle(playing: boolean, enabled: boolean): CSSProperties {
  return {
    flexShrink: 0,
    display: "inline-grid",
    placeItems: "center",
    width: 30,
    height: 30,
    borderRadius: 8,
    border: "1px solid var(--line-strong)",
    background: playing ? "var(--gold-soft)" : "var(--bg-card)",
    color: "var(--gold-on-light)",
    cursor: enabled ? "pointer" : "not-allowed",
    opacity: enabled ? 1 : 0.4,
  };
}

/** "이 음성을 아바타 제작에 사용" 토글 — 활성이면 골드 채움, 비활성이면 골드 외곽선. */
function avatarUseBtnStyle(active: boolean): CSSProperties {
  return {
    width: "100%",
    padding: "8px 12px",
    fontSize: 12.5,
    fontWeight: 700,
    borderRadius: 9,
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    border: `1px solid ${active ? "transparent" : "var(--gold-on-light)"}`,
    background: active ? "linear-gradient(135deg, #FFB627, #E89E0E)" : "var(--bg-card)",
    color: active ? "#0A0A0A" : "var(--gold-on-light)",
  };
}
