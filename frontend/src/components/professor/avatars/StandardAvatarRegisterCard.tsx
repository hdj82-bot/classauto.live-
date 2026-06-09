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
import { listHeyGenAccountAvatars, registerStandardAvatar } from "./avatarsApi";
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

// 검색 결과를 한 번에 너무 많이 그리지 않도록 캡(이미지 카드라 무겁다). 초과분은
// "검색으로 좁히세요" 안내로 대체한다.
const MAX_VISIBLE = 48;

/**
 * "표준 아바타 등록" — HeyGen 계정 아바타를 이름·썸네일로 골라 등록한다.
 *
 * Pay-As-You-Go 등급은 커스텀 Video Avatar 를 API 로 생성할 수 없으므로(Enterprise
 * 전용), 교수자가 HeyGen 웹 스튜디오에서 본인 영상으로 Video Avatar 를 1회 만든 뒤
 * 그 아바타를 여기서 고른다. avatar_id 를 직접 찾을 필요 없이, 계정 아바타 목록을
 * 불러와 스튜디오에서 지은 이름으로 검색·선택한다(고른 id 는 /v2/avatars 출처라
 * 등록 검증을 항상 통과). 목록을 못 불러오면 avatar_id 직접 입력으로 폴백한다.
 *
 * 카드(썸네일)를 누르면 전체 둘러보기 페이지와 동일하게 **크게 보기(라이트박스)**가
 * 열리고, 거기서 표시 이름을 다듬은 뒤 "이 아바타 등록"으로 바로 등록한다. 이전엔
 * 클릭이 "선택만" 하고 하단의 별도 버튼을 눌러야 등록돼, 클릭해도 상단 "룩"에 변화가
 * 없어 보였다(2026-06-09 사용자 피드백). 클릭 → 큰 화면 → 등록의 한 흐름으로 통일한다.
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

  // 계정 아바타 목록(피커). null = 아직 로드 전.
  const [accountAvatars, setAccountAvatars] = useState<Avatar[] | null>(null);
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [search, setSearch] = useState("");

  // 크게 보기(라이트박스) 대상 + 그 안에서 편집 중인 표시 이름. null = 닫힘.
  const [zoom, setZoom] = useState<Avatar | null>(null);
  const [zoomName, setZoomName] = useState("");
  // 등록 진행 중인 아바타 id(라이트박스 버튼 busy 표시).
  const [registeringId, setRegisteringId] = useState<string | null>(null);

  // avatar_id 직접 입력(폴백). 목록을 못 불러왔거나 사용자가 펼치면 노출.
  const [manualOpen, setManualOpen] = useState(false);
  const [manualId, setManualId] = useState("");
  const [manualName, setManualName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadAccount = useCallback(async () => {
    setLoadStatus("loading");
    try {
      const list = await listHeyGenAccountAvatars();
      setAccountAvatars(list);
      setLoadStatus("ready");
      // 목록이 비면(MOCK/미배포/계정에 아바타 없음) 수동 입력을 바로 펼친다.
      if (list.length === 0) setManualOpen(true);
    } catch {
      setAccountAvatars([]);
      setLoadStatus("error");
      setManualOpen(true);
    }
  }, []);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  const filtered = useMemo(() => {
    const list = accountAvatars ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((a) => a.name.toLowerCase().includes(q));
  }, [accountAvatars, search]);

  const visible = filtered.slice(0, MAX_VISIBLE);
  const overflow = filtered.length - visible.length;

  // 썸네일 클릭 — 크게 보기를 열고 표시 이름을 그 아바타 이름으로 채운다(이후 편집 가능).
  const openZoom = useCallback((a: Avatar) => {
    setZoom(a);
    setZoomName(a.name ?? "");
  }, []);

  // 등록 — 피커에서 고른 아바타를 메타데이터와 함께 등록(서버 재조회 생략)하고,
  // 라이트박스를 닫은 뒤 부모에 알린다(부모가 상단 "룩"으로 선택 + 라이브러리 갱신).
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

  // 수동 입력(avatar_id 직접) 등록 — 메타데이터 없이 id 만 보낸다(서버가 조회).
  const handleManualSubmit = useCallback(async () => {
    const id = manualId.trim();
    if (!id) return;
    setSubmitting(true);
    try {
      const avatar = await registerStandardAvatar(
        id,
        manualName.trim() || null,
        null,
      );
      toast(t("standardRegisterSuccess"), "success");
      setManualId("");
      setManualName("");
      onRegistered?.(avatar);
    } catch (err) {
      toast(backendDetail(err) ?? t("standardRegisterError"), "error");
    } finally {
      setSubmitting(false);
    }
  }, [manualId, manualName, toast, t, onRegistered]);

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

      {/* 계정 아바타 피커 — 이름으로 검색해 본인 스튜디오 아바타를 고른다. */}
      {loadStatus !== "error" && (accountAvatars?.length ?? 0) > 0 && (
        <div style={{ marginTop: 16 }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("standardPickerSearchPlaceholder")}
            data-testid="standard-picker-search"
            style={inputStyle}
          />
          {filtered.length === 0 ? (
            <p style={mutedNote}>{t("standardPickerSearchEmpty")}</p>
          ) : (
            <>
              <div style={gridStyle} data-testid="standard-picker-grid">
                {visible.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => openZoom(a)}
                    data-testid={`standard-picker-item-${a.id}`}
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
              {overflow > 0 && (
                <p style={mutedNote}>
                  {t("standardPickerMoreHint", { count: overflow })}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {loadStatus === "loading" && (
        <p style={mutedNote} data-testid="standard-picker-loading">
          {t("standardPickerLoading")}
        </p>
      )}
      {loadStatus === "error" && (
        <p role="alert" style={errorNote} data-testid="standard-picker-error">
          {t("standardPickerError")}
        </p>
      )}

      {/* avatar_id 직접 입력(폴백) — 목록에서 못 찾거나 id 를 이미 아는 경우. */}
      <button
        type="button"
        onClick={() => setManualOpen((v) => !v)}
        data-testid="standard-manual-toggle"
        style={manualToggleBtn}
      >
        {manualOpen ? t("standardManualHide") : t("standardManualToggle")}
      </button>
      {manualOpen && (
        <div style={{ marginTop: 10 }}>
          <input
            value={manualId}
            onChange={(e) => setManualId(e.target.value)}
            placeholder={t("standardRegisterIdPlaceholder")}
            data-testid="standard-avatar-id-input"
            maxLength={255}
            style={inputStyle}
          />
          <label style={{ ...labelStyle, marginTop: 10 }}>
            {t("standardRegisterNameLabel")}
            <input
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder={t("standardRegisterNamePlaceholder")}
              data-testid="standard-avatar-name-input"
              maxLength={80}
              style={inputStyle}
            />
          </label>
          <ol style={guideStyle}>
            <li>{t("standardRegisterStep1")}</li>
            <li>{t("standardRegisterStep2Api")}</li>
          </ol>
          <button
            type="button"
            onClick={handleManualSubmit}
            disabled={submitting || !manualId.trim()}
            data-testid="standard-avatar-register-submit"
            style={{
              ...submitBtn,
              opacity: submitting || !manualId.trim() ? 0.5 : 1,
              cursor: submitting || !manualId.trim() ? "not-allowed" : "pointer",
            }}
          >
            {submitting ? t("standardRegistering") : t("standardRegisterSubmit")}
          </button>
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

const labelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 12.5,
  fontWeight: 600,
  color: "var(--text)",
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  fontSize: 13,
  borderRadius: 10,
  border: "1px solid var(--line-strong)",
  background: "var(--bg-card)",
  color: "var(--text)",
  fontFamily: "inherit",
  outline: "none",
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

const manualToggleBtn: CSSProperties = {
  marginTop: 14,
  padding: 0,
  border: "none",
  background: "transparent",
  color: "var(--gold-on-light, #B88308)",
  fontSize: 12.5,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};

const guideStyle: CSSProperties = {
  margin: "10px 0 0",
  padding: "12px 14px 12px 30px",
  borderRadius: 12,
  background: "var(--bg-subtle)",
  border: "1px solid var(--line)",
  fontSize: 12.5,
  lineHeight: 1.7,
  color: "var(--text-muted)",
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
