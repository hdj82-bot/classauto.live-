"use client";

import {
  useCallback,
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import type { Avatar } from "./avatarsTypes";

interface AvatarBrowserProps {
  avatars: Avatar[];
  loading: boolean;
  error: boolean;
  /** 룩 등록(표준 아바타로). 성공 시 호출자가 네비게이션을 처리한다. */
  onRegister: (avatar: Avatar) => Promise<void> | void;
  /** 등록 진행 중인 룩의 avatar_id(버튼 로딩 표시). */
  registeringId: string | null;
  reducedMotion: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * 캐릭터 이름 추출 — "Aditya in Blue blazer"→"Aditya", "Abigail (Upper Body)"→"Abigail",
 * "Adriana Nurse Front"→"Adriana", "Annie"→"Annie". HeyGen /v2/avatars 는 룩을 개별
 * 아바타로 주고 그룹 필드를 안정적으로 안 주므로, 이름 앞 토큰으로 캐릭터를 묶는다.
 */
function characterOf(name: string): string {
  const trimmed = (name || "").trim();
  let base = trimmed.split(/\s+in\s+/i)[0]; // " in " 앞
  base = base.split("(")[0]; // "(" 앞
  base = base.trim().split(/\s+/)[0]; // 첫 단어
  return base || trimmed || "Avatar";
}

interface CharacterGroup {
  character: string;
  looks: Avatar[];
}

/**
 * 공개 아바타 브라우저 — HeyGen "공개 아바타" 갤러리 스타일.
 *
 * 모든 공개 아바타를 캐릭터별로 묶어 큰 카드로 보여 주고(룩 수 표시), 카드를 클릭하면
 * 그 캐릭터의 룩을 크게 펼쳐 고른다. 카드/룩에 마우스를 올리면 미리보기 영상이
 * 재생된다. 검색창으로 캐릭터·룩 이름을 거른다. 룩의 "이 아바타 등록"으로 표준
 * 아바타로 등록한다.
 */
export default function AvatarBrowser({
  avatars,
  loading,
  error,
  onRegister,
  registeringId,
  reducedMotion,
  t,
}: AvatarBrowserProps) {
  const [search, setSearch] = useState("");
  const [openCharacter, setOpenCharacter] = useState<string | null>(null);

  const groups = useMemo<CharacterGroup[]>(() => {
    const m = new Map<string, Avatar[]>();
    for (const a of avatars) {
      const c = characterOf(a.name);
      const arr = m.get(c);
      if (arr) arr.push(a);
      else m.set(c, [a]);
    }
    return Array.from(m.entries())
      .map(([character, looks]) => ({ character, looks }))
      .sort((a, b) => a.character.localeCompare(b.character));
  }, [avatars]);

  const filteredGroups = useMemo<CharacterGroup[]>(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    const out: CharacterGroup[] = [];
    for (const g of groups) {
      if (g.character.toLowerCase().includes(q)) {
        out.push(g);
        continue;
      }
      const looks = g.looks.filter((l) => l.name.toLowerCase().includes(q));
      if (looks.length) out.push({ character: g.character, looks });
    }
    return out;
  }, [groups, search]);

  const openGroup = useMemo(
    () => groups.find((g) => g.character === openCharacter) ?? null,
    [groups, openCharacter],
  );

  const totalLooks = avatars.length;

  return (
    <div data-testid="avatar-browser">
      <div style={searchRow}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("browseSearchPlaceholder")}
          data-testid="browse-search"
          style={searchInput}
        />
        <span style={countLabel}>
          {t("browseCount", { characters: groups.length, looks: totalLooks })}
        </span>
      </div>

      {loading ? (
        <p style={note} data-testid="browse-loading">
          {t("browseLoading")}
        </p>
      ) : error ? (
        <p role="alert" style={errNote} data-testid="browse-error">
          {t("browseError")}
        </p>
      ) : filteredGroups.length === 0 ? (
        <p style={note}>{t("browseEmpty")}</p>
      ) : (
        <div style={grid} data-testid="browse-grid">
          {filteredGroups.map((g) => (
            <button
              key={g.character}
              type="button"
              onClick={() => setOpenCharacter(g.character)}
              data-testid={`browse-character-${g.character}`}
              style={charCard}
            >
              <HoverPreview
                avatar={g.looks[0]}
                reducedMotion={reducedMotion}
                aspect="3 / 4"
              />
              <span style={charMeta}>
                <span style={charName} title={g.character}>
                  {g.character}
                </span>
                <span style={lookCount}>{t("browseLookCount", { count: g.looks.length })}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {/* 캐릭터 룩 상세 — 클릭하면 룩을 크게 펼친다. */}
      {openGroup && (
        <CharacterLooksModal
          group={openGroup}
          onClose={() => setOpenCharacter(null)}
          onRegister={onRegister}
          registeringId={registeringId}
          reducedMotion={reducedMotion}
          t={t}
        />
      )}
    </div>
  );
}

/** 정지 썸네일 + 마우스 호버 시 미리보기 영상 재생(무음 루프). */
function HoverPreview({
  avatar,
  reducedMotion,
  aspect,
}: {
  avatar: Avatar;
  reducedMotion: boolean;
  aspect: string;
}) {
  const [hover, setHover] = useState(false);
  const hasVideo = !!avatar.preview_video_url;
  const showVideo = hover && hasVideo && !reducedMotion;
  return (
    <span
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...mediaWrap, aspectRatio: aspect }}
    >
      {showVideo ? (
        <video
          src={avatar.preview_video_url ?? undefined}
          autoPlay
          muted
          loop
          playsInline
          preload="none"
          style={fill}
        />
      ) : avatar.preview_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatar.preview_image_url} alt={avatar.name} loading="lazy" style={fill} />
      ) : (
        <span aria-hidden="true" style={initial}>
          {avatar.name.slice(0, 1)}
        </span>
      )}
      {hasVideo && !showVideo && (
        <span aria-hidden="true" style={playHint}>
          ▶
        </span>
      )}
    </span>
  );
}

/** 캐릭터의 모든 룩을 크게 펼치는 모달 — 각 룩 호버 미리보기 + "이 아바타 등록". */
function CharacterLooksModal({
  group,
  onClose,
  onRegister,
  registeringId,
  reducedMotion,
  t,
}: {
  group: CharacterGroup;
  onClose: () => void;
  onRegister: (avatar: Avatar) => Promise<void> | void;
  registeringId: string | null;
  reducedMotion: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={group.character}
      data-testid="browse-looks-modal"
      style={overlay}
      onClick={onClose}
      onKeyDown={onKey}
    >
      <div style={modalCard} onClick={(e) => e.stopPropagation()}>
        <div style={modalHeader}>
          <div>
            <h3 style={modalTitle}>{group.character}</h3>
            <p style={modalSub}>{t("browseLookCount", { count: group.looks.length })}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("browseClose")}
            data-testid="browse-looks-close"
            style={closeBtn}
          >
            ✕
          </button>
        </div>

        <div style={modalGrid}>
          {group.looks.map((look) => {
            const busy = registeringId === look.id;
            return (
              <div key={look.id} style={lookCard} data-testid={`browse-look-${look.id}`}>
                <HoverPreview avatar={look} reducedMotion={reducedMotion} aspect="3 / 4" />
                <span style={lookName} title={look.name}>
                  {look.name}
                </span>
                <button
                  type="button"
                  onClick={() => onRegister(look)}
                  disabled={!!registeringId}
                  data-testid={`browse-register-${look.id}`}
                  style={{
                    ...registerBtn,
                    opacity: registeringId ? 0.5 : 1,
                    cursor: registeringId ? "not-allowed" : "pointer",
                  }}
                >
                  {busy ? t("browseRegistering") : t("browseRegister")}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const searchRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 18,
};

const searchInput: CSSProperties = {
  flex: 1,
  minWidth: 240,
  padding: "11px 14px",
  fontSize: 14,
  borderRadius: 12,
  border: "1px solid var(--line-strong)",
  background: "var(--bg-card)",
  color: "var(--text)",
  fontFamily: "inherit",
  outline: "none",
};

const countLabel: CSSProperties = {
  fontSize: 12.5,
  color: "var(--text-muted)",
  fontVariantNumeric: "tabular-nums",
};

const note: CSSProperties = {
  margin: "24px 0",
  fontSize: 13,
  color: "var(--text-muted)",
};

const errNote: CSSProperties = {
  margin: "24px 0",
  padding: "12px 14px",
  borderRadius: 12,
  fontSize: 13,
  color: "var(--warning, #B45309)",
  background: "var(--gold-soft)",
  border: "1px solid var(--gold-medium)",
};

const grid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
  gap: 16,
};

const charCard: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  padding: 0,
  border: "1px solid var(--line)",
  borderRadius: 14,
  overflow: "hidden",
  background: "var(--bg-card)",
  cursor: "pointer",
  fontFamily: "inherit",
  textAlign: "left",
  boxShadow: "var(--shadow-sm)",
};

const mediaWrap: CSSProperties = {
  position: "relative",
  display: "block",
  width: "100%",
  background: "var(--bg-subtle)",
  overflow: "hidden",
};

const fill: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const initial: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "grid",
  placeItems: "center",
  fontSize: 44,
  fontWeight: 700,
  color: "var(--text-faint)",
};

const playHint: CSSProperties = {
  position: "absolute",
  bottom: 8,
  right: 8,
  width: 26,
  height: 26,
  borderRadius: 999,
  display: "grid",
  placeItems: "center",
  fontSize: 11,
  color: "#fff",
  background: "rgba(10,10,10,0.55)",
  backdropFilter: "blur(2px)",
};

const charMeta: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  padding: "10px 12px",
};

const charName: CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: "var(--text)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const lookCount: CSSProperties = {
  fontSize: 12,
  color: "var(--text-muted)",
};

const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 50,
  background: "rgba(10,10,10,0.55)",
  backdropFilter: "blur(3px)",
  display: "grid",
  placeItems: "center",
  padding: 20,
};

const modalCard: CSSProperties = {
  width: "min(1000px, 100%)",
  maxHeight: "88vh",
  overflowY: "auto",
  background: "var(--bg-card)",
  borderRadius: 18,
  border: "1px solid var(--line-strong)",
  boxShadow: "0 24px 60px rgba(0,0,0,0.28)",
  padding: 22,
};

const modalHeader: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 16,
};

const modalTitle: CSSProperties = {
  margin: 0,
  fontSize: 20,
  fontWeight: 800,
  color: "var(--text)",
};

const modalSub: CSSProperties = {
  margin: "4px 0 0",
  fontSize: 13,
  color: "var(--text-muted)",
};

const closeBtn: CSSProperties = {
  flexShrink: 0,
  width: 34,
  height: 34,
  borderRadius: 10,
  border: "1px solid var(--line)",
  background: "var(--bg-card)",
  color: "var(--text-muted)",
  fontSize: 15,
  cursor: "pointer",
  fontFamily: "inherit",
};

const modalGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
  gap: 16,
};

const lookCard: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  border: "1px solid var(--line)",
  borderRadius: 14,
  overflow: "hidden",
  background: "var(--bg-card)",
  paddingBottom: 10,
};

const lookName: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "var(--text)",
  padding: "0 10px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const registerBtn: CSSProperties = {
  margin: "0 10px",
  padding: "9px 12px",
  fontSize: 13,
  fontWeight: 700,
  borderRadius: 10,
  border: "1px solid transparent",
  background: "linear-gradient(135deg, #FFB627, #E89E0E)",
  color: "#0A0A0A",
  fontFamily: "inherit",
};
