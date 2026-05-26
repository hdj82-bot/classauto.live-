"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { PageContainer, PageHeader } from "@/components/professor/shell";
import { useToast } from "@/components/ui/Toast";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useVoicePreview } from "@/components/professor/avatars/useVoicePreview";
import {
  listVoiceOptions,
  setVoiceFavorite,
} from "@/components/professor/avatars/voicesApi";
import type { VoiceOption } from "@/components/professor/avatars/voicePresets";

/**
 * /professor/voices — 음성 라이브러리.
 *
 * ElevenLabs premade 보이스 전체를 미리듣고 즐겨찾기(★)하는 페이지. 즐겨찾기한
 * 보이스는 studio "음성과 자막" 패널의 "즐겨찾기만" 토글에서 바로 골라 쓸 수
 * 있다. 백엔드 GET /api/voices(is_favorite 포함) + PUT/DELETE
 * /api/voices/{id}/favorite 를 사용한다. 키 미설정/장애 시 listVoiceOptions 가
 * 합성 폴백 프리셋으로 degrade 한다(그때는 즐겨찾기 비활성).
 */

const SAMPLE_TEXT = "안녕하세요. 이 목소리로 강의 영상을 만들 수 있어요.";

type Filter = "all" | "favorites" | "male" | "female";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "favorites", label: "즐겨찾기" },
  { key: "male", label: "남성" },
  { key: "female", label: "여성" },
];

/** 합성 폴백 보이스(백엔드 미응답)는 id 가 "tts-" 로 시작 — 즐겨찾기 불가. */
function isFallbackVoice(id: string): boolean {
  return id.startsWith("tts-");
}

export default function VoicesPage() {
  const { toast } = useToast();
  const { supported, play, stop } = useVoicePreview();

  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [deferred, setDeferred] = useState(false);
  const [favIds, setFavIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [playingId, setPlayingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { voices: list, deferred: isDeferred } = await listVoiceOptions();
      if (cancelled) return;
      setVoices(list);
      setDeferred(isDeferred);
      setFavIds(new Set(list.filter((v) => v.favorite).map((v) => v.id)));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => stop(), [stop]);

  const shown = useMemo(() => {
    if (filter === "favorites") return voices.filter((v) => favIds.has(v.id));
    if (filter === "male" || filter === "female") {
      return voices.filter((v) => v.gender === filter);
    }
    return voices;
  }, [voices, favIds, filter]);

  const toggleFavorite = async (id: string) => {
    if (isFallbackVoice(id)) return;
    const next = !favIds.has(id);
    setFavIds((prev) => {
      const s = new Set(prev);
      if (next) s.add(id);
      else s.delete(id);
      return s;
    });
    try {
      await setVoiceFavorite(id, next);
    } catch {
      setFavIds((prev) => {
        const s = new Set(prev);
        if (next) s.delete(id);
        else s.add(id);
        return s;
      });
      toast("즐겨찾기 저장에 실패했어요. 잠시 후 다시 시도해 주세요.", "error");
    }
  };

  const onPreview = (v: VoiceOption) => {
    if (playingId === v.id) {
      stop();
      setPlayingId(null);
      return;
    }
    setPlayingId(v.id);
    play(v, SAMPLE_TEXT, () =>
      setPlayingId((cur) => (cur === v.id ? null : cur)),
    );
  };

  if (loading) {
    return <LoadingSpinner fullScreen label="음성 목록을 불러오는 중…" />;
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="음성 라이브러리"
        title="음성 고르기"
        subtitle="ElevenLabs 보이스를 미리듣고 ★로 즐겨찾기하세요. 즐겨찾기한 음성은 강의 만들기 화면의 ‘즐겨찾기만’에서 바로 고를 수 있어요."
        actions={
          <Link href="/professor/dashboard" style={linkBtnStyle}>
            ← 대시보드
          </Link>
        }
      />

      {deferred && (
        <p
          role="status"
          style={{
            margin: "0 0 16px",
            padding: "10px 14px",
            borderRadius: 10,
            background: "var(--gold-soft)",
            color: "var(--gold-on-light, #B88308)",
            fontSize: 12.5,
            lineHeight: 1.5,
          }}
        >
          ElevenLabs 보이스 목록을 불러오지 못해 미리보기용 기본 음성을 보여주고
          있어요. (즐겨찾기는 실제 보이스에서만 저장됩니다.)
        </p>
      )}

      <div className="flex flex-wrap gap-2" style={{ marginBottom: 18 }}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={active}
              style={{
                ...chipStyle,
                borderColor: active ? "var(--gold)" : "var(--line-strong)",
                background: active ? "var(--gold)" : "var(--bg-card)",
                color: active ? "#0A0A0A" : "var(--text-muted)",
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {filter === "favorites"
            ? "아직 즐겨찾기한 음성이 없어요. ★를 눌러 추가하세요."
            : "표시할 음성이 없습니다."}
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          {shown.map((v) => (
            <VoiceCard
              key={v.id}
              voice={v}
              favorite={favIds.has(v.id)}
              canFavorite={!isFallbackVoice(v.id)}
              playing={playingId === v.id}
              canPreview={supported}
              onPreview={() => onPreview(v)}
              onToggleFavorite={() => toggleFavorite(v.id)}
            />
          ))}
        </div>
      )}
    </PageContainer>
  );
}

function VoiceCard({
  voice,
  favorite,
  canFavorite,
  playing,
  canPreview,
  onPreview,
  onToggleFavorite,
}: {
  voice: VoiceOption;
  favorite: boolean;
  canFavorite: boolean;
  playing: boolean;
  canPreview: boolean;
  onPreview: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--line)",
        borderRadius: 12,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {voice.name}
          </div>
          {voice.meta && (
            <div
              style={{
                fontSize: 11.5,
                color: "var(--text-subtle)",
                marginTop: 2,
                lineHeight: 1.4,
              }}
            >
              {voice.meta}
            </div>
          )}
        </div>
        <span
          style={{
            flexShrink: 0,
            fontSize: 10,
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: 999,
            background: "var(--bg)",
            color: "var(--text-muted)",
          }}
        >
          {voice.gender === "male" ? "남성" : "여성"}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPreview}
          disabled={!canPreview}
          style={{
            ...pillBtn,
            opacity: canPreview ? 1 : 0.5,
            cursor: canPreview ? "pointer" : "not-allowed",
          }}
        >
          {playing ? "■ 정지" : "▶ 미리듣기"}
        </button>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onToggleFavorite}
          disabled={!canFavorite}
          aria-pressed={favorite}
          aria-label={favorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
          title={
            canFavorite
              ? favorite
                ? "즐겨찾기 해제"
                : "즐겨찾기 추가"
              : "기본 음성은 즐겨찾기할 수 없어요"
          }
          style={{
            flexShrink: 0,
            display: "inline-grid",
            placeItems: "center",
            width: 34,
            height: 34,
            borderRadius: 9,
            border: "1px solid",
            borderColor: favorite ? "var(--gold)" : "var(--line-strong)",
            background: favorite ? "var(--gold-soft)" : "var(--bg-card)",
            color: favorite ? "var(--gold-on-light, #B88308)" : "var(--text-faint)",
            cursor: canFavorite ? "pointer" : "not-allowed",
            opacity: canFavorite ? 1 : 0.4,
            fontSize: 16,
            lineHeight: 1,
          }}
        >
          {favorite ? "★" : "☆"}
        </button>
      </div>
    </div>
  );
}

const linkBtnStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 14px",
  borderRadius: 9,
  border: "1px solid var(--line-strong)",
  background: "var(--bg-card)",
  color: "var(--text)",
  fontSize: 13,
  fontWeight: 600,
  textDecoration: "none",
};

const chipStyle: CSSProperties = {
  padding: "6px 14px",
  fontSize: 12.5,
  fontWeight: 600,
  borderRadius: 999,
  border: "1px solid var(--line-strong)",
  cursor: "pointer",
  fontFamily: "inherit",
};

const pillBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "7px 12px",
  borderRadius: 8,
  border: "1px solid var(--line-strong)",
  background: "var(--bg-card)",
  fontSize: 12.5,
  fontWeight: 600,
  color: "var(--text)",
  fontFamily: "inherit",
};
