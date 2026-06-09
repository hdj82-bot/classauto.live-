"use client";

import {
  useCallback,
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
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
  /** 즐겨찾기한 avatar_id 집합. */
  favorites: Set<string>;
  /** 별표 토글 — (avatar_id, next). 낙관적 갱신은 호출자가 처리. */
  onToggleFavorite: (avatarId: string, next: boolean) => void;
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
  let base = trimmed.split(/\s+in\s+/i)[0];
  base = base.split("(")[0];
  base = base.trim().split(/\s+/)[0];
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
 * 재생되고, 룩을 클릭하면 원본 크기로 크게(라이트박스) 볼 수 있다. 룩 우상단 별표로
 * 즐겨찾기하고 "즐겨찾기만 보기"로 거른다. "이 아바타 등록"으로 표준 아바타 등록.
 */
export default function AvatarBrowser({
  avatars,
  loading,
  error,
  onRegister,
  registeringId,
  favorites,
  onToggleFavorite,
  reducedMotion,
  t,
}: AvatarBrowserProps) {
  const [search, setSearch] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [openCharacter, setOpenCharacter] = useState<string | null>(null);
  const [zoom, setZoom] = useState<Avatar | null>(null);

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
    const out: CharacterGroup[] = [];
    for (const g of groups) {
      let looks = favoritesOnly
        ? g.looks.filter((l) => favorites.has(l.id))
        : g.looks;
      if (q && !g.character.toLowerCase().includes(q)) {
        looks = looks.filter((l) => l.name.toLowerCase().includes(q));
      }
      if (looks.length) out.push({ character: g.character, looks });
    }
    return out;
  }, [groups, search, favoritesOnly, favorites]);

  // 열린 캐릭터의 룩(즐겨찾기만 보기면 즐겨찾기 룩으로 한정).
  const openGroup = useMemo(() => {
    const g = groups.find((x) => x.character === openCharacter);
    if (!g) return null;
    const looks = favoritesOnly
      ? g.looks.filter((l) => favorites.has(l.id))
      : g.looks;
    return looks.length ? { character: g.character, looks } : null;
  }, [groups, openCharacter, favoritesOnly, favorites]);

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
        <button
          type="button"
          onClick={() => setFavoritesOnly((v) => !v)}
          aria-pressed={favoritesOnly}
          data-testid="browse-favorites-only"
          style={favOnlyBtn(favoritesOnly)}
        >
          {favoritesOnly ? "★" : "☆"} {t("favoritesOnly")}
        </button>
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
        <p style={note}>
          {favoritesOnly ? t("browseFavEmpty") : t("browseEmpty")}
        </p>
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
              <HoverPreview avatar={g.looks[0]} reducedMotion={reducedMotion} aspect="3 / 4" />
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
          favorites={favorites}
          onToggleFavorite={onToggleFavorite}
          onClose={() => setOpenCharacter(null)}
          onRegister={onRegister}
          registeringId={registeringId}
          onZoom={(a) => setZoom(a)}
          reducedMotion={reducedMotion}
          t={t}
        />
      )}

      {/* 원본 크기 크게 보기(라이트박스) */}
      {zoom && (
        <Lightbox
          avatar={zoom}
          favorite={favorites.has(zoom.id)}
          onToggleFavorite={onToggleFavorite}
          onRegister={onRegister}
          registering={registeringId === zoom.id}
          registerDisabled={!!registeringId}
          onClose={() => setZoom(null)}
          t={t}
        />
      )}
    </div>
  );
}

/**
 * 정지 썸네일 + 마우스 호버 시 미리보기 영상 재생. onClick 이 있으면 클릭 가능(확대),
 * cornerSlot 은 우상단에 겹쳐 그린다(별표 등).
 */
function HoverPreview({
  avatar,
  reducedMotion,
  aspect,
  onClick,
  cornerSlot,
}: {
  avatar: Avatar;
  reducedMotion: boolean;
  aspect: string;
  onClick?: () => void;
  cornerSlot?: ReactNode;
}) {
  const [hover, setHover] = useState(false);
  const hasVideo = !!avatar.preview_video_url;
  const showVideo = hover && hasVideo && !reducedMotion;
  return (
    <span
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{ ...mediaWrap, aspectRatio: aspect, cursor: onClick ? "zoom-in" : "default" }}
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
      {cornerSlot}
      {hasVideo && !showVideo && (
        <span aria-hidden="true" style={playHint}>
          ▶
        </span>
      )}
    </span>
  );
}

function StarButton({
  active,
  onToggle,
  t,
}: {
  active: boolean;
  onToggle: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-pressed={active}
      aria-label={t(active ? "favoriteRemove" : "favoriteAdd")}
      title={t(active ? "favoriteRemove" : "favoriteAdd")}
      style={starBtn(active)}
    >
      {active ? "★" : "☆"}
    </button>
  );
}

/** 캐릭터의 모든 룩을 크게 펼치는 모달 — 룩 호버 미리보기 + 별표 + 확대 + 등록. */
function CharacterLooksModal({
  group,
  favorites,
  onToggleFavorite,
  onClose,
  onRegister,
  registeringId,
  onZoom,
  reducedMotion,
  t,
}: {
  group: CharacterGroup;
  favorites: Set<string>;
  onToggleFavorite: (avatarId: string, next: boolean) => void;
  onClose: () => void;
  onRegister: (avatar: Avatar) => Promise<void> | void;
  registeringId: string | null;
  onZoom: (avatar: Avatar) => void;
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
            const fav = favorites.has(look.id);
            return (
              <div key={look.id} style={lookCard} data-testid={`browse-look-${look.id}`}>
                <HoverPreview
                  avatar={look}
                  reducedMotion={reducedMotion}
                  aspect="3 / 4"
                  onClick={() => onZoom(look)}
                  cornerSlot={
                    <StarButton
                      active={fav}
                      onToggle={() => onToggleFavorite(look.id, !fav)}
                      t={t}
                    />
                  }
                />
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

/** 원본 크기 크게 보기 — 영상(있으면)·이미지를 큰 화면으로, 별표·등록 포함. */
function Lightbox({
  avatar,
  favorite,
  onToggleFavorite,
  onRegister,
  registering,
  registerDisabled,
  onClose,
  t,
}: {
  avatar: Avatar;
  favorite: boolean;
  onToggleFavorite: (avatarId: string, next: boolean) => void;
  onRegister: (avatar: Avatar) => Promise<void> | void;
  registering: boolean;
  registerDisabled: boolean;
  onClose: () => void;
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
      aria-label={avatar.name}
      data-testid="browse-lightbox"
      style={{ ...overlay, zIndex: 60 }}
      onClick={onClose}
      onKeyDown={onKey}
    >
      <div style={lightboxInner} onClick={(e) => e.stopPropagation()}>
        <div style={lightboxMedia}>
          {avatar.preview_video_url ? (
            <video
              src={avatar.preview_video_url}
              autoPlay
              muted
              loop
              controls
              playsInline
              style={lightboxFill}
            />
          ) : avatar.preview_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar.preview_image_url} alt={avatar.name} style={lightboxFill} />
          ) : (
            <span aria-hidden="true" style={initial}>
              {avatar.name.slice(0, 1)}
            </span>
          )}
        </div>
        <div style={lightboxBar}>
          <span style={lightboxName} title={avatar.name}>
            {avatar.name}
          </span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              onClick={() => onToggleFavorite(avatar.id, !favorite)}
              aria-pressed={favorite}
              title={t(favorite ? "favoriteRemove" : "favoriteAdd")}
              style={lightboxStar(favorite)}
            >
              {favorite ? "★" : "☆"}
            </button>
            <button
              type="button"
              onClick={() => onRegister(avatar)}
              disabled={registerDisabled}
              data-testid="lightbox-register"
              style={{
                ...registerBtn,
                margin: 0,
                opacity: registerDisabled ? 0.5 : 1,
                cursor: registerDisabled ? "not-allowed" : "pointer",
              }}
            >
              {registering ? t("browseRegistering") : t("browseRegister")}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("browseClose")}
              style={closeBtn}
            >
              ✕
            </button>
          </div>
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
  minWidth: 220,
  padding: "11px 14px",
  fontSize: 14,
  borderRadius: 12,
  border: "1px solid var(--line-strong)",
  background: "var(--bg-card)",
  color: "var(--text)",
  fontFamily: "inherit",
  outline: "none",
};

function favOnlyBtn(active: boolean): CSSProperties {
  return {
    flexShrink: 0,
    padding: "10px 14px",
    fontSize: 13,
    fontWeight: 700,
    borderRadius: 12,
    cursor: "pointer",
    fontFamily: "inherit",
    color: active ? "#0A0A0A" : "var(--text-muted)",
    background: active ? "var(--gold)" : "var(--bg-card)",
    border: `1px solid ${active ? "var(--gold)" : "var(--line-strong)"}`,
  };
}

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

function starBtn(active: boolean): CSSProperties {
  return {
    position: "absolute",
    top: 6,
    right: 6,
    width: 30,
    height: 30,
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    fontSize: 16,
    lineHeight: 1,
    cursor: "pointer",
    fontFamily: "inherit",
    color: active ? "#FFB627" : "#fff",
    background: "rgba(10,10,10,0.55)",
    border: "none",
    backdropFilter: "blur(2px)",
  };
}

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
  background: "rgba(10,10,10,0.6)",
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

const lightboxInner: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  maxWidth: "min(92vw, 1100px)",
  maxHeight: "92vh",
};

const lightboxMedia: CSSProperties = {
  position: "relative",
  display: "grid",
  placeItems: "center",
  maxHeight: "80vh",
  borderRadius: 14,
  overflow: "hidden",
  background: "#000",
};

const lightboxFill: CSSProperties = {
  maxWidth: "92vw",
  maxHeight: "80vh",
  width: "auto",
  height: "auto",
  objectFit: "contain",
  display: "block",
};

const lightboxBar: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  padding: "4px 2px",
};

const lightboxName: CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: "#fff",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

function lightboxStar(active: boolean): CSSProperties {
  return {
    width: 36,
    height: 36,
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    fontSize: 18,
    cursor: "pointer",
    fontFamily: "inherit",
    color: active ? "#FFB627" : "#fff",
    background: "rgba(255,255,255,0.15)",
    border: "1px solid rgba(255,255,255,0.3)",
  };
}
