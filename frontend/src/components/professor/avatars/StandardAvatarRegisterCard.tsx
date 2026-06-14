"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";
import {
  listFavoriteAvatars,
  listHeyGenAccountAvatars,
  registerStandardAvatar,
} from "./avatarsApi";
import type { Avatar, StandardAvatar } from "./avatarsTypes";

interface StandardAvatarRegisterCardProps {
  /** 등록 성공 시 — 페이지가 라이브러리를 즉시 다시 불러온다. */
  onRegistered?: (avatar: StandardAvatar) => void;
  /** 강의 컨텍스트 — 전체 둘러보기 링크에 보존한다. */
  lectureId?: string | null;
  t: (key: string, params?: Record<string, string | number>) => string;
}

/** 백엔드 오류 응답의 detail 문구를 꺼낸다(없으면 null). */
function backendDetail(err: unknown): string | null {
  const e = err as { response?: { data?: { detail?: unknown } } } | undefined;
  const d = e?.response?.data?.detail;
  return typeof d === "string" && d.trim() ? d : null;
}

/**
 * "표준 아바타 등록" — 둘러보기에서 즐겨찾기(★)한 표준 아바타만 보여 준다.
 *
 * 종전엔 계정 전체 아바타(수백~수천 개)를 인라인 피커로 깔고 avatar_id 직접 입력까지
 * 두어 복잡했다. 이제 선택은 "전체 공개 아바타 둘러보기"에서 하고(거기서 ★ 즐겨찾기),
 * 이 카드는 즐겨찾기한 것만 추려 등록·적용한다(2026-06-14 사용자 결정).
 *
 * 표준 등록은 Video Avatar(/v2/avatars) 전용이므로, 즐겨찾기 id 를 계정 아바타 목록과
 * 교차해 그 목록에 있는 것만(=등록 가능한 표준 아바타) 메타데이터와 함께 보여 준다.
 * 포토 아바타 룩 즐겨찾기는 여기에 나타나지 않는다(표준 등록 대상이 아님).
 *
 * 카드(썸네일)를 누르면 크게 보기(라이트박스)가 열리고, 표시 이름을 다듬은 뒤
 * "이 아바타 등록"으로 바로 등록한다.
 */
export default function StandardAvatarRegisterCard({
  onRegistered,
  lectureId,
  t,
}: StandardAvatarRegisterCardProps) {
  const browseHref = `/professor/avatars/browse${
    lectureId ? `?lecture=${lectureId}` : ""
  }`;
  const { toast } = useToast();

  // 즐겨찾기 id 집합 + 계정 아바타 목록(메타데이터 출처). null = 로드 전.
  const [favoriteIds, setFavoriteIds] = useState<Set<string> | null>(null);
  const [accountAvatars, setAccountAvatars] = useState<Avatar[] | null>(null);
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  // 크게 보기(라이트박스) 대상 + 그 안에서 편집 중인 표시 이름. null = 닫힘.
  const [zoom, setZoom] = useState<Avatar | null>(null);
  const [zoomName, setZoomName] = useState("");
  // 등록 진행 중인 아바타 id(라이트박스 버튼 busy 표시).
  const [registeringId, setRegisteringId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadStatus("loading");
    try {
      const [favs, account] = await Promise.all([
        listFavoriteAvatars(),
        listHeyGenAccountAvatars(),
      ]);
      setFavoriteIds(new Set(favs));
      setAccountAvatars(account);
      setLoadStatus("ready");
    } catch {
      setFavoriteIds(new Set());
      setAccountAvatars([]);
      setLoadStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 즐겨찾기한 표준(Video) 아바타 — 계정 목록에 있는 즐겨찾기만(포토 룩 제외).
  const favoriteAvatars = useMemo(() => {
    if (!accountAvatars || !favoriteIds) return [];
    return accountAvatars.filter((a) => favoriteIds.has(a.id));
  }, [accountAvatars, favoriteIds]);

  // 썸네일 클릭 — 크게 보기를 열고 표시 이름을 그 아바타 이름으로 채운다(이후 편집 가능).
  const openZoom = useCallback((a: Avatar) => {
    setZoom(a);
    setZoomName(a.name ?? "");
  }, []);

  // 등록 — 고른 아바타를 메타데이터와 함께 등록(서버 재조회 생략)하고, 라이트박스를
  // 닫은 뒤 부모에 알린다(부모가 상단 "룩"으로 선택 + 라이브러리 갱신).
  const registerPicked = useCallback(
    async (a: Avatar, displayName: string) => {
      setRegisteringId(a.id);
      try {
        const avatar = await registerStandardAvatar(
          a.id,
          displayName.trim() || null,
          {
            preview_image_url: a.preview_image_url,
            preview_video_url: a.preview_video_url,
            gender: a.gender,
          },
        );
        toast(t("standardRegisterSuccess"), "success");
        setZoom(null);
        onRegistered?.(avatar);
      } catch (err) {
        toast(backendDetail(err) ?? t("standardRegisterError"), "error");
      } finally {
        setRegisteringId(null);
      }
    },
    [toast, t, onRegistered],
  );

  return (
    <div data-testid="standard-avatar-register" style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <FilmIcon />
        <h3 style={titleStyle}>{t("standardRegisterTitle")}</h3>
      </div>
      <p style={descStyle}>{t("standardRegisterDescription")}</p>
      <Link href={browseHref} data-testid="standard-browse-link" style={heygenLinkStyle}>
        {t("standardBrowseLink")} →
      </Link>

      {loadStatus === "loading" ? (
        <p style={mutedNote} data-testid="standard-fav-loading">
          {t("standardPickerLoading")}
        </p>
      ) : loadStatus === "error" ? (
        <p role="alert" style={errorNote} data-testid="standard-picker-error">
          {t("standardPickerError")}
        </p>
      ) : favoriteAvatars.length === 0 ? (
        <p style={mutedNote} data-testid="standard-fav-empty">
          {t("standardFavEmpty")}
        </p>
      ) : (
        <div style={gridStyle} data-testid="standard-fav-grid">
          {favoriteAvatars.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => openZoom(a)}
              data-testid={`standard-fav-item-${a.id}`}
              style={pickStyle}
            >
              <span style={thumbWrap}>
                {a.preview_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.preview_image_url}
                    alt={a.name}
                    loading="lazy"
                    style={fillStyle}
                  />
                ) : (
                  <span aria-hidden="true" style={thumbInitial}>
                    {a.name.slice(0, 1)}
                  </span>
                )}
                <span aria-hidden="true" style={zoomHint}>
                  ⤢
                </span>
              </span>
              <span style={pickName} title={a.name}>
                {a.name}
              </span>
            </button>
          ))}
        </div>
      )}

      {zoom && (
        <PickerLightbox
          avatar={zoom}
          name={zoomName}
          onNameChange={setZoomName}
          registering={registeringId === zoom.id}
          onRegister={() => registerPicked(zoom, zoomName)}
          onClose={() => setZoom(null)}
          t={t}
        />
      )}
    </div>
  );
}

/** 피커 썸네일 클릭 시 크게 보기 — 큰 미리보기 + 표시 이름 편집 + "이 아바타 등록". */
function PickerLightbox({
  avatar,
  name,
  onNameChange,
  registering,
  onRegister,
  onClose,
  t,
}: {
  avatar: Avatar;
  name: string;
  onNameChange: (v: string) => void;
  registering: boolean;
  onRegister: () => void;
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
      data-testid="standard-picker-lightbox"
      style={overlay}
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
            <span aria-hidden="true" style={lightboxInitial}>
              {avatar.name.slice(0, 1)}
            </span>
          )}
        </div>
        <div style={lightboxBar}>
          <label style={lightboxNameLabel}>
            {t("standardRegisterNameLabel")}
            <input
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder={t("standardRegisterNamePlaceholder")}
              data-testid="standard-lightbox-name-input"
              maxLength={80}
              style={lightboxNameInput}
            />
          </label>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
            <button
              type="button"
              onClick={onRegister}
              disabled={registering}
              data-testid="standard-lightbox-register"
              style={{
                ...submitBtn,
                margin: 0,
                opacity: registering ? 0.5 : 1,
                cursor: registering ? "not-allowed" : "pointer",
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

function FilmIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--gold-on-light, #B88308)"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" />
    </svg>
  );
}

const cardStyle: CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--line)",
  borderRadius: 16,
  padding: 22,
  boxShadow: "var(--shadow-sm)",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 700,
  color: "var(--text)",
};

const descStyle: CSSProperties = {
  margin: "2px 0 0",
  fontSize: 13,
  lineHeight: 1.6,
  color: "var(--text-muted)",
};

const heygenLinkStyle: CSSProperties = {
  display: "inline-block",
  marginTop: 8,
  fontSize: 12.5,
  fontWeight: 700,
  color: "var(--gold-on-light, #B88308)",
  textDecoration: "none",
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
  gap: 10,
  marginTop: 12,
  maxHeight: 360,
  overflowY: "auto",
  padding: 2,
};

const pickStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: 8,
  borderRadius: 12,
  cursor: "zoom-in",
  textAlign: "left",
  fontFamily: "inherit",
  background: "var(--bg-card)",
  border: "1px solid var(--line)",
  transition: "border-color 140ms var(--ease-out)",
};

const thumbWrap: CSSProperties = {
  position: "relative",
  width: "100%",
  aspectRatio: "3 / 4",
  borderRadius: 8,
  overflow: "hidden",
  background: "var(--bg-subtle)",
  display: "block",
};

const fillStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const thumbInitial: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "grid",
  placeItems: "center",
  fontSize: 28,
  fontWeight: 700,
  color: "var(--text-faint)",
};

const zoomHint: CSSProperties = {
  position: "absolute",
  bottom: 5,
  right: 5,
  width: 22,
  height: 22,
  borderRadius: 999,
  display: "grid",
  placeItems: "center",
  fontSize: 12,
  color: "#fff",
  background: "rgba(10,10,10,0.55)",
  backdropFilter: "blur(2px)",
};

const pickName: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const mutedNote: CSSProperties = {
  margin: "10px 0 0",
  fontSize: 12,
  lineHeight: 1.5,
  color: "var(--text-muted)",
};

const errorNote: CSSProperties = {
  margin: "12px 0 0",
  padding: "10px 12px",
  borderRadius: 10,
  fontSize: 12,
  lineHeight: 1.5,
  color: "var(--warning, #B45309)",
  background: "var(--gold-soft)",
  border: "1px solid var(--gold-medium)",
};

const submitBtn: CSSProperties = {
  display: "block",
  marginTop: 18,
  padding: "11px 20px",
  fontSize: 14,
  fontWeight: 700,
  borderRadius: 12,
  border: "1px solid transparent",
  background: "linear-gradient(135deg, #FFB627, #E89E0E)",
  color: "#0A0A0A",
  fontFamily: "inherit",
};

const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 60,
  background: "rgba(10,10,10,0.6)",
  backdropFilter: "blur(3px)",
  display: "grid",
  placeItems: "center",
  padding: 20,
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
  maxHeight: "78vh",
  borderRadius: 14,
  overflow: "hidden",
  background: "#000",
};

const lightboxFill: CSSProperties = {
  maxWidth: "92vw",
  maxHeight: "78vh",
  width: "auto",
  height: "auto",
  objectFit: "contain",
  display: "block",
};

const lightboxInitial: CSSProperties = {
  display: "grid",
  placeItems: "center",
  width: 240,
  height: 320,
  fontSize: 64,
  fontWeight: 700,
  color: "#fff",
};

const lightboxBar: CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  padding: "4px 2px",
};

const lightboxNameLabel: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  flex: 1,
  minWidth: 200,
  fontSize: 12.5,
  fontWeight: 600,
  color: "#fff",
};

const lightboxNameInput: CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  fontSize: 13,
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.3)",
  background: "rgba(255,255,255,0.12)",
  color: "#fff",
  fontFamily: "inherit",
  outline: "none",
};

const closeBtn: CSSProperties = {
  flexShrink: 0,
  width: 38,
  height: 38,
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.3)",
  background: "rgba(255,255,255,0.15)",
  color: "#fff",
  fontSize: 15,
  cursor: "pointer",
  fontFamily: "inherit",
};
