"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import type { SavedAvatar } from "./avatarsTypes";

interface SavedAvatarCardProps {
  avatar: SavedAvatar;
  /** look_id 로 해석한 룩 썸네일(없으면 이니셜 폴백). */
  lookImageUrl?: string | null;
  /** voice_id 로 해석한 음성 표시 이름(없으면 기본 보이스 라벨). */
  voiceName?: string | null;
  /** 강의 컨텍스트(?lecture=)가 있어 "강의에 적용"이 가능한지. */
  canApply: boolean;
  /** 이 카드가 강의에 적용되는 중인지(버튼 비활성·라벨). */
  applying: boolean;
  /** 강의에 적용 — 적용 후 부모가 studio 로 복귀시킨다. */
  onApply: (id: string) => void;
  /** 이름 변경(낙관적). */
  onRename: (id: string, name: string) => void;
  /** 삭제(낙관적). */
  onDelete: (id: string) => void;
  /** 미리보기 영상 렌더 트리거(없거나 실패했을 때). */
  onPreview: (id: string) => void;
  /** prefers-reduced-motion — 루프 영상 자동재생을 끈다. */
  reducedMotion: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * "내 아바타(룩 + 음성 조합) 갤러리" 카드 1개.
 *
 * preview_status==="ready" 이고 preview_video_url 이 있으면 무음 루프 영상을
 * 재생하고(reducedMotion 이면 자동재생 없이 첫 프레임만), 아니면 룩 썸네일로
 * 폴백한다. 처리 중이면 스피너/배지를, 실패면 다시 만들기 안내를 띄운다.
 * 디자인은 AvatarCard / AvatarLibrary 의 토큰(라이트 베이지 + 골드)을 재사용한다.
 */
export default function SavedAvatarCard({
  avatar,
  lookImageUrl,
  voiceName,
  canApply,
  applying,
  onApply,
  onRename,
  onDelete,
  onPreview,
  reducedMotion,
  t,
}: SavedAvatarCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(avatar.name);

  // 우상단 ⋮ 메뉴(이름 변경·삭제) — AvatarCard 와 동일 패턴.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const ready =
    avatar.preview_status === "ready" && !!avatar.preview_video_url;
  const processing = avatar.preview_status === "processing";
  const failed = avatar.preview_status === "failed";

  const startEdit = () => {
    setDraft(avatar.name);
    setEditing(true);
  };
  const commitEdit = () => {
    const next = draft.trim();
    if (next && next !== avatar.name) onRename(avatar.id, next);
    setEditing(false);
  };
  const cancelEdit = () => {
    setDraft(avatar.name);
    setEditing(false);
  };
  const onEditKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  };

  return (
    <div
      data-testid={`saved-avatar-card-${avatar.id}`}
      style={{ position: "relative" }}
    >
      <div style={cardStyle}>
        {/* 미디어 — ready 루프 영상 / 룩 썸네일 / 이니셜 */}
        <div style={mediaWrapStyle}>
          {ready ? (
            <video
              key={avatar.preview_video_url ?? avatar.id}
              data-testid={`saved-avatar-video-${avatar.id}`}
              src={avatar.preview_video_url ?? undefined}
              poster={lookImageUrl ?? undefined}
              muted
              loop
              playsInline
              autoPlay={!reducedMotion}
              preload="metadata"
              aria-label={avatar.name}
              style={fillStyle}
            />
          ) : lookImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={lookImageUrl}
              alt={avatar.name}
              loading="lazy"
              style={fillStyle}
            />
          ) : (
            <span aria-hidden="true" style={initialStyle}>
              {avatar.name.slice(0, 1)}
            </span>
          )}

          {/* 처리 중 — 스피너 오버레이 + 배지 */}
          {processing && (
            <div
              data-testid={`saved-avatar-processing-${avatar.id}`}
              style={overlayStyle}
            >
              <span style={spinnerStyle} aria-hidden="true" />
              <span style={overlayTextStyle}>{t("previewProcessing")}</span>
            </div>
          )}

          {/* ready 배지 — "미리보기" */}
          {ready && (
            <span style={readyBadgeStyle}>
              <span aria-hidden="true">▶</span> {t("previewReady")}
            </span>
          )}
        </div>

        {/* 본문 — 이름 + 음성 라벨 */}
        <div style={bodyStyle}>
          {editing ? (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onEditKeyDown}
                maxLength={80}
                aria-label={t("renameAvatar")}
                placeholder={t("renamePlaceholder")}
                data-testid={`saved-avatar-name-input-${avatar.id}`}
                style={nameInputStyle}
              />
              <button
                type="button"
                onClick={commitEdit}
                data-testid={`saved-avatar-name-save-${avatar.id}`}
                style={miniBtn(true)}
              >
                {t("renameSave")}
              </button>
              <button type="button" onClick={cancelEdit} style={miniBtn(false)}>
                {t("renameCancel")}
              </button>
            </div>
          ) : (
            <span style={nameStyle} title={avatar.name}>
              {avatar.name}
            </span>
          )}
          <span style={voiceStyle}>
            <span aria-hidden="true">🔊</span>{" "}
            {voiceName || t("savedDefaultVoice")}
          </span>
        </div>

        {/* 액션 — 강의에 적용 / 미리보기 만들기 */}
        <div style={actionsStyle}>
          {canApply ? (
            <button
              type="button"
              onClick={() => onApply(avatar.id)}
              disabled={applying}
              data-testid={`saved-avatar-apply-${avatar.id}`}
              style={{
                ...applyBtnStyle,
                opacity: applying ? 0.55 : 1,
                cursor: applying ? "wait" : "pointer",
              }}
            >
              {applying ? t("applying") : t("applyToLecture")}
            </button>
          ) : (
            <span style={applyHintStyle}>{t("savedApplyHintNoLecture")}</span>
          )}

          {/* 미리보기 영상이 아직 없거나 실패했으면 렌더 트리거 */}
          {(avatar.preview_status === "none" || failed) && (
            <button
              type="button"
              onClick={() => onPreview(avatar.id)}
              data-testid={`saved-avatar-preview-${avatar.id}`}
              style={ghostBtnStyle}
            >
              {failed ? t("previewRetry") : t("previewCreate")}
            </button>
          )}
        </div>

        {failed && (
          <p role="alert" style={failedHintStyle}>
            {t("previewFailed")}
          </p>
        )}
      </div>

      {/* 우상단 ⋮ 메뉴 — 이름 변경 / 삭제 */}
      <div ref={menuRef} style={menuAnchorStyle}>
        <button
          type="button"
          aria-label={t("menuOpen")}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          data-testid={`saved-avatar-menu-${avatar.id}`}
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          style={menuButtonStyle}
        >
          <DotsIcon />
        </button>
        {menuOpen && (
          <div role="menu" style={menuDropdownStyle}>
            <button
              type="button"
              role="menuitem"
              data-testid={`saved-avatar-rename-${avatar.id}`}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                startEdit();
              }}
              style={menuItemStyle}
            >
              {t("renameAvatar")}
            </button>
            <button
              type="button"
              role="menuitem"
              data-testid={`saved-avatar-delete-${avatar.id}`}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onDelete(avatar.id);
              }}
              style={{ ...menuItemStyle, color: "var(--danger, #C0392B)" }}
            >
              {t("deleteAvatar")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function DotsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  );
}

const cardStyle: CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--line)",
  borderRadius: 14,
  overflow: "hidden",
  boxShadow: "var(--shadow-sm)",
  display: "flex",
  flexDirection: "column",
};

const mediaWrapStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  // 룩(가로형 1536×1024) + 말하는 영상은 16:9 로 넓게.
  aspectRatio: "16 / 9",
  background: "var(--bg-subtle)",
  overflow: "hidden",
};

const fillStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const initialStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "grid",
  placeItems: "center",
  fontSize: 44,
  fontWeight: 700,
  color: "var(--text-faint)",
};

const overlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  color: "#fff",
  background: "rgba(10,10,10,0.5)",
  backdropFilter: "blur(2px)",
};

const spinnerStyle: CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: "50%",
  border: "3px solid rgba(255,255,255,0.35)",
  borderTopColor: "#FFB627",
  // globals.css 의 studio-spin(360° 회전) 재사용. 전역 reduce-motion 규칙이
  // duration 을 줄이므로 reducedMotion 환경에서도 과한 회전이 되지 않는다.
  animation: "studio-spin 0.9s linear infinite",
};

const overlayTextStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
};

const readyBadgeStyle: CSSProperties = {
  position: "absolute",
  bottom: 6,
  left: 6,
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 700,
  color: "#fff",
  background: "rgba(10,10,10,0.55)",
  backdropFilter: "blur(2px)",
};

const bodyStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: "10px 11px 6px",
};

const nameStyle: CSSProperties = {
  fontSize: 13.5,
  fontWeight: 700,
  color: "var(--text)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const voiceStyle: CSSProperties = {
  fontSize: 11.5,
  color: "var(--text-muted)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const nameInputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: "5px 8px",
  fontSize: 12.5,
  border: "1px solid var(--line-strong)",
  borderRadius: 8,
  background: "var(--bg-card)",
  color: "var(--text)",
  fontFamily: "inherit",
  outline: "none",
};

function miniBtn(primary: boolean): CSSProperties {
  return {
    flexShrink: 0,
    padding: "5px 10px",
    fontSize: 12,
    fontWeight: 700,
    borderRadius: 8,
    cursor: "pointer",
    fontFamily: "inherit",
    border: `1px solid ${primary ? "transparent" : "var(--line-strong)"}`,
    color: primary ? "#0A0A0A" : "var(--text-muted)",
    background: primary ? "var(--gold)" : "var(--bg-card)",
  };
}

const actionsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  padding: "0 11px 11px",
  alignItems: "center",
};

const applyBtnStyle: CSSProperties = {
  flex: 1,
  minWidth: 120,
  padding: "9px 14px",
  fontSize: 12.5,
  fontWeight: 700,
  borderRadius: 10,
  border: "1px solid transparent",
  background: "linear-gradient(135deg, #FFB627, #E89E0E)",
  color: "#0A0A0A",
  fontFamily: "inherit",
};

const ghostBtnStyle: CSSProperties = {
  padding: "9px 12px",
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 10,
  border: "1px solid var(--line-strong)",
  background: "var(--bg-card)",
  color: "var(--text)",
  fontFamily: "inherit",
  cursor: "pointer",
};

const applyHintStyle: CSSProperties = {
  fontSize: 11.5,
  lineHeight: 1.5,
  color: "var(--text-faint)",
};

const failedHintStyle: CSSProperties = {
  margin: "0 11px 11px",
  fontSize: 11.5,
  lineHeight: 1.5,
  color: "var(--warning)",
};

const menuAnchorStyle: CSSProperties = {
  position: "absolute",
  top: 8,
  right: 8,
  zIndex: 3,
};

const menuButtonStyle: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 8,
  border: "1px solid var(--line)",
  background: "rgba(255,255,255,0.9)",
  color: "var(--text)",
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  boxShadow: "var(--shadow-sm)",
  fontFamily: "inherit",
};

const menuDropdownStyle: CSSProperties = {
  position: "absolute",
  top: 32,
  right: 0,
  minWidth: 140,
  background: "var(--bg-card)",
  border: "1px solid var(--line-strong)",
  borderRadius: 10,
  boxShadow: "0 10px 28px rgba(0,0,0,0.16)",
  padding: 4,
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const menuItemStyle: CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  fontSize: 12.5,
  fontWeight: 600,
  borderRadius: 7,
  border: "none",
  background: "transparent",
  color: "var(--text)",
  cursor: "pointer",
  fontFamily: "inherit",
  whiteSpace: "nowrap",
};
