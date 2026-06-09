"use client";

import {
  useCallback,
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { Avatar, HeyGenAvatarGroup } from "./avatarsTypes";

interface AvatarBrowserProps {
  /** Video Avatar(/v2/avatars) — 이름 앞 토큰으로 캐릭터 그룹핑. */
  avatars: Avatar[];
  /** Photo Avatar 그룹(/v2/avatar_group.list) — 룩은 열 때 lazy 로드. */
  groups: HeyGenAvatarGroup[];
  /** 그룹 룩 lazy 로드 — 카드를 열 때 호출(결과는 캐시됨). */
  loadGroupLooks: (groupId: string) => Promise<Avatar[]>;
  loading: boolean;
  error: boolean;
  onRegister: (avatar: Avatar) => Promise<void> | void;
  registeringId: string | null;
  favorites: Set<string>;
  onToggleFavorite: (avatarId: string, next: boolean) => void;
  reducedMotion: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}

/** "Aditya in Blue blazer"→"Aditya" 등 이름 앞 토큰으로 Video Avatar 를 묶는다. */
function characterOf(name: string): string {
  const trimmed = (name || "").trim();
  let base = trimmed.split(/\s+in\s+/i)[0];
  base = base.split("(")[0];
  base = base.trim().split(/\s+/)[0];
  return base || trimmed || "Avatar";
}

/** 통합 캐릭터 — Video Avatar 그룹(looks 준비됨) 또는 Photo Avatar 그룹(lazy). */
interface BrowserChar {
  key: string;
  name: string;
  count: number;
  preview: Avatar; // 카드 썸네일/호버용 대표
  videoLooks: Avatar[] | null; // video: 준비된 룩 / group: null(lazy)
  groupId: string | null;
}

/**
 * 공개 아바타 브라우저 — HeyGen "공개 아바타" 갤러리 스타일.
 *
 * Video Avatar(/v2/avatars)는 이름으로 캐릭터를 묶고, Photo Avatar 그룹
 * (/v2/avatar_group.list, 웹의 "Annie 57룩" 류)은 카드로 함께 노출한다. 그룹은
 * 룩이 많아 카드를 열 때 그 그룹의 룩을 lazy 로 받는다. 호버 미리보기·별표 즐겨찾기·
 * "즐겨찾기만 보기"·룩 클릭 확대(라이트박스)·"이 아바타 등록"을 제공한다.
 */
export default function AvatarBrowser({
  avatars,
  groups,
  loadGroupLooks,
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
  const [openChar, setOpenChar] = useState<BrowserChar | null>(null);
  const [groupLooks, setGroupLooks] = useState<Record<string, Avatar[]>>({});
  const [loadingLooks, setLoadingLooks] = useState(false);
  const [zoom, setZoom] = useState<Avatar | null>(null);

  const characters = useMemo<BrowserChar[]>(() => {
    const m = new Map<string, Avatar[]>();
    for (const a of avatars) {
      const c = characterOf(a.name);
      const arr = m.get(c);
      if (arr) arr.push(a);
      else m.set(c, [a]);
    }
    const videoChars: BrowserChar[] = Array.from(m.entries()).map(
      ([name, looks]) => ({
        key: `v:${name}`,
        name,
        count: looks.length,
        preview: looks[0],
        videoLooks: looks,
        groupId: null,
      }),
    );
    const groupChars: BrowserChar[] = groups.map((g) => ({
      key: `g:${g.group_id}`,
      name: g.name,
      count: g.num_looks,
      preview: {
        id: g.group_id,
        name: g.name,
        preview_image_url: g.preview_image_url,
        preview_video_url: null,
      },
      videoLooks: null,
      groupId: g.group_id,
    }));
    return [...videoChars, ...groupChars].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [avatars, groups]);

  // 캐릭터의 알려진 룩(video=준비됨, group=캐시됐으면). 검색/즐겨찾기 필터에 쓴다.
  const knownLooksOf = useCallback(
    (c: BrowserChar): Avatar[] | null =>
      c.videoLooks ?? (c.groupId ? groupLooks[c.groupId] ?? null : null),
    [groupLooks],
  );

  const visibleChars = useMemo<BrowserChar[]>(() => {
    const q = search.trim().toLowerCase();
    return characters.filter((c) => {
      if (favoritesOnly) {
        const known = knownLooksOf(c);
        // 룩을 아직 모르는 그룹은 즐겨찾기 여부를 알 수 없어 제외(열어 본 그룹만 노출).
        if (!known || !known.some((l) => favorites.has(l.id))) return false;
      }
      if (q) {
        if (c.name.toLowerCase().includes(q)) return true;
        const known = knownLooksOf(c);
        return !!known && known.some((l) => l.name.toLowerCase().includes(q));
      }
      return true;
    });
  }, [characters, search, favoritesOnly, favorites, knownLooksOf]);

  const openLooks: Avatar[] | null = openChar
    ? openChar.videoLooks ??
      (openChar.groupId ? groupLooks[openChar.groupId] ?? null : [])
    : null;

  const handleOpen = useCallback(
    async (c: BrowserChar) => {
      setOpenChar(c);
      if (c.videoLooks || !c.groupId || groupLooks[c.groupId]) return;
      setLoadingLooks(true);
      try {
        const looks = await loadGroupLooks(c.groupId);
        setGroupLooks((prev) => ({ ...prev, [c.groupId as string]: looks }));
      } finally {
        setLoadingLooks(false);
      }
    },
    [groupLooks, loadGroupLooks],
  );

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
          {t("browseCount", {
            characters: characters.length,
            looks:
              avatars.length +
              groups.reduce((s, g) => s + (g.num_looks || 0), 0),
          })}
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
      ) : visibleChars.length === 0 ? (
        <p style={note}>{favoritesOnly ? t("browseFavEmpty") : t("browseEmpty")}</p>
      ) : (
        <div style={grid} data-testid="browse-grid">
          {visibleChars.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => handleOpen(c)}
              data-testid={`browse-character-${c.name}`}
              style={charCard}
            >
              <HoverPreview avatar={c.preview} reducedMotion={reducedMotion} aspect="3 / 4" />
              <span style={charMeta}>
                <span style={charName} title={c.name}>
                  {c.name}
                </span>
                <span style={lookCount}>{t("browseLookCount", { count: c.count })}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {openChar && (
        <CharacterModal
          name={openChar.name}
          looks={openLooks}
          loading={loadingLooks && !openLooks}
          favoritesOnly={favoritesOnly}
          favorites={favorites}
          onToggleFavorite={onToggleFavorite}
          onClose={() => setOpenChar(null)}
          onRegister={onRegister}
          registeringId={registeringId}
          onZoom={(a) => setZoom(a)}
          reducedMotion={reducedMotion}
          t={t}
        />
      )}

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

/** 캐릭터의 룩을 크게 펼치는 모달 — lazy 로딩 지원. */
function CharacterModal({
  name,
  looks,
  loading,
  favoritesOnly,
  favorites,
  onToggleFavorite,
  onClose,
  onRegister,
  registeringId,
  onZoom,
  reducedMotion,
  t,
}: {
  name: string;
  looks: Avatar[] | null;
  loading: boolean;
  favoritesOnly: boolean;
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
  const shown = useMemo(
    () =>
      looks
        ? favoritesOnly
          ? looks.filter((l) => favorites.has(l.id))
          : looks
        : [],
    [looks, favoritesOnly, favorites],
  );
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={name}
      data-testid="browse-looks-modal"
      style={overlay}
      onClick={onClose}
      onKeyDown={onKey}
    >
      <div style={modalCard} onClick={(e) => e.stopPropagation()}>
        <div style={modalHeader}>
          <div>
            <h3 style={modalTitle}>{name}</h3>
            <p style={modalSub}>
              {looks ? t("browseLookCount", { count: shown.length }) : t("browseLoading")}
            </p>
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

        {loading || !looks ? (
          <p style={note}>{t("browseLoading")}</p>
        ) : shown.length === 0 ? (
          <p style={note}>{t("browseFavEmpty")}</p>
        ) : (
          <div style={modalGrid}>
            {shown.map((look) => {
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
        )}
      </div>
    </div>
  );
}

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
