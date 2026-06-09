"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import type { Avatar } from "./avatarsTypes";

interface AvatarCardProps {
  avatar: Avatar;
  selected: boolean;
  onSelect: (id: string) => void;
  /** 강의 컨텍스트(?lecture=)가 있어 인라인 이름 변경이 가능한지. */
  renameEnabled: boolean;
  /** 강의별 표시 이름 저장 콜백. */
  onRename: (name: string) => void;
  /**
   * 제공되면 우상단 ⋮ 메뉴로 이 항목을 라이브러리에서 삭제할 수 있다. 라이브러리
   * 카드에만 넘긴다 — 표준 HeyGen 아바타는 삭제 대상이 아니다.
   */
  onDelete?: (id: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const mediaWrapStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  background: "var(--bg-subtle)",
  overflow: "hidden",
};

/**
 * 아바타 카드 — 정지 썸네일 + 클릭 선택.
 *
 * 마우스 hover 자동 영상재생은 제거했다(작은 창에서 보기 어렵고 산만함). 카드는
 * 썸네일만 보여 주고, 클릭하면 "저장된 아바타·룩 라이브러리"에서 선택 상태가 되어
 * 우측 상단 "룩과 목소리 아바타 제작"의 대상(룩)이 된다.
 */
export default function AvatarCard({
  avatar,
  selected,
  onSelect,
  renameEnabled,
  onRename,
  onDelete,
  t,
}: AvatarCardProps) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(avatar.name);

  // 우상단 ⋮ 메뉴 — onDelete 가 있을 때만(라이브러리 카드).
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

  const hasVideo = !!avatar.preview_video_url;

  const startEdit = () => {
    setDraftName(avatar.name);
    setEditing(true);
  };
  const commitEdit = () => {
    const next = draftName.trim();
    if (next && next !== avatar.name) onRename(next);
    setEditing(false);
  };
  const cancelEdit = () => {
    setDraftName(avatar.name);
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

  const genderLabel =
    avatar.gender === "male"
      ? t("genderMale")
      : avatar.gender === "female"
        ? t("genderFemale")
        : null;

  // 포토 아바타 / 표준 아바타 구별 배지 — 라이브러리 항목에만(kind 지정 시) 노출.
  const kindLabel =
    avatar.kind === "photo"
      ? t("kindPhoto")
      : avatar.kind === "standard"
        ? t("kindStandard")
        : null;

  return (
    <div style={{ position: "relative" }}>
    <div
      data-testid={`avatar-card-${avatar.id}`}
      data-selected={selected ? "true" : "false"}
      style={{
        background: "var(--bg-card)",
        border: `2px solid ${selected ? "var(--gold)" : "var(--line)"}`,
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: selected ? "0 0 0 3px var(--gold-medium)" : "var(--shadow-sm)",
        transition:
          "border-color 140ms var(--ease-out), box-shadow 140ms var(--ease-out)",
      }}
    >
      <button
        type="button"
        onClick={() => onSelect(avatar.id)}
        aria-pressed={selected}
        aria-label={t("select") + ": " + avatar.name}
        style={{
          display: "block",
          width: "100%",
          padding: 0,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: "inherit",
        }}
      >
        <span
          style={{
            ...mediaWrapStyle,
            // 가로형 룩(1536×1024)은 16:9 로 넓게, 표준 세로 아바타는 기존 3:4 유지.
            aspectRatio: avatar.isLook ? "16 / 9" : "3 / 4",
          }}
        >
          {avatar.preview_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatar.preview_image_url}
              alt={avatar.name}
              loading="lazy"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
          ) : hasVideo ? (
            // 이미지가 없을 때는 영상의 첫 프레임만 정지 노출(자동재생 안 함).
            <video
              src={avatar.preview_video_url ?? undefined}
              muted
              playsInline
              preload="metadata"
              aria-hidden="true"
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
                fontSize: 40,
                fontWeight: 700,
                color: "var(--text-faint)",
              }}
            >
              {avatar.name.slice(0, 1)}
            </span>
          )}

          {/* 포토/표준 구별 배지 — 좌상단 */}
          {kindLabel && (
            <span
              data-testid={`avatar-card-kind-${avatar.id}`}
              style={{
                position: "absolute",
                top: 6,
                left: 6,
                padding: "2px 8px",
                borderRadius: 999,
                fontSize: 10,
                fontWeight: 700,
                color: "#0A0A0A",
                background:
                  avatar.kind === "standard"
                    ? "var(--gold)"
                    : "rgba(255,255,255,0.92)",
                border:
                  avatar.kind === "standard"
                    ? "1px solid var(--gold)"
                    : "1px solid var(--line)",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              {kindLabel}
            </span>
          )}

          {/* 클릭 안내 — hover 자동재생 대신 "클릭하면 크게 재생" */}
          {hasVideo && !selected && (
            <span
              style={{
                position: "absolute",
                bottom: 6,
                right: 6,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "2px 8px",
                borderRadius: 999,
                fontSize: 10,
                fontWeight: 600,
                color: "#fff",
                background: "rgba(10,10,10,0.55)",
                backdropFilter: "blur(2px)",
              }}
            >
              <span aria-hidden="true">▶</span>
              {t("playPreviewLarge")}
            </span>
          )}

          {selected && (
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                top: 6,
                right: 6,
                width: 22,
                height: 22,
                borderRadius: 999,
                display: "grid",
                placeItems: "center",
                background: "var(--gold)",
                color: "#0A0A0A",
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              ✓
            </span>
          )}
        </span>

        <span
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 8,
            padding: "9px 11px 4px",
          }}
        >
          <span
            style={{
              fontSize: 13.5,
              fontWeight: 600,
              color: "var(--text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {avatar.name}
          </span>
          {genderLabel && (
            <span style={{ fontSize: 11, color: "var(--text-faint)", flexShrink: 0 }}>
              {genderLabel}
            </span>
          )}
        </span>
      </button>

      {/* 인라인 이름 변경 — 선택 + 강의 컨텍스트가 있을 때만 */}
      {selected && renameEnabled && (
        <div style={{ padding: "0 11px 11px" }}>
          {editing ? (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={onEditKeyDown}
                aria-label={t("renameLabel")}
                placeholder={t("renamePlaceholder")}
                style={{
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
                }}
              />
              <button
                type="button"
                onClick={commitEdit}
                style={renameBtnStyle(true)}
              >
                {t("renameSave")}
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                style={renameBtnStyle(false)}
              >
                {t("renameCancel")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={startEdit}
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--gold-on-light)",
                background: "transparent",
                border: "none",
                padding: "2px 0",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {t("renameEdit")}
            </button>
          )}
        </div>
      )}
    </div>

      {/* 우상단 ⋮ 메뉴 — 라이브러리에서 삭제(카드 선택 버튼 바깥 형제). */}
      {onDelete && (
        <div ref={menuRef} style={cardMenuAnchor}>
          <button
            type="button"
            aria-label={t("menuOpen")}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            data-testid={`avatar-card-menu-${avatar.id}`}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            style={cardMenuButton}
          >
            <CardDotsIcon />
          </button>
          {menuOpen && (
            <div role="menu" style={cardMenuDropdown}>
              <button
                type="button"
                role="menuitem"
                data-testid={`avatar-card-delete-${avatar.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onDelete(avatar.id);
                }}
                style={{ ...cardMenuItem, color: "var(--danger, #C0392B)" }}
              >
                {t("cardDelete")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CardDotsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  );
}

const cardMenuAnchor: CSSProperties = {
  position: "absolute",
  top: 8,
  right: 8,
  zIndex: 3,
};

const cardMenuButton: CSSProperties = {
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

const cardMenuDropdown: CSSProperties = {
  position: "absolute",
  top: 32,
  right: 0,
  minWidth: 130,
  background: "var(--bg-card)",
  border: "1px solid var(--line-strong)",
  borderRadius: 10,
  boxShadow: "0 10px 28px rgba(0,0,0,0.16)",
  padding: 4,
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const cardMenuItem: CSSProperties = {
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

function renameBtnStyle(primary: boolean): CSSProperties {
  return {
    flexShrink: 0,
    padding: "5px 10px",
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 8,
    cursor: "pointer",
    fontFamily: "inherit",
    border: `1px solid ${primary ? "transparent" : "var(--line-strong)"}`,
    color: primary ? "#0A0A0A" : "var(--text-muted)",
    background: primary ? "var(--gold)" : "var(--bg-card)",
  };
}
