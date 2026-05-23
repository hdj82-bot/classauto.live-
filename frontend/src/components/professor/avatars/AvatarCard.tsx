"use client";

import {
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
  t: (key: string, params?: Record<string, string | number>) => string;
}

const mediaWrapStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  aspectRatio: "3 / 4",
  background: "var(--bg-subtle)",
  overflow: "hidden",
};

/**
 * 아바타 카드 — 정지 썸네일 + 클릭 선택.
 *
 * 마우스 hover 자동 영상재생은 제거했다(작은 창에서 보기 어렵고 산만함). 카드는
 * 썸네일만 보여 주고, 클릭하면 선택되어 상단 ``AvatarPreviewStage`` 에서 크게
 * 음성과 함께 재생된다.
 */
export default function AvatarCard({
  avatar,
  selected,
  onSelect,
  renameEnabled,
  onRename,
  t,
}: AvatarCardProps) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(avatar.name);

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

  return (
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
        <span style={mediaWrapStyle}>
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

          {avatar.is_custom && (
            <span
              style={{
                position: "absolute",
                top: 6,
                left: 6,
                padding: "2px 8px",
                borderRadius: 999,
                fontSize: 10,
                fontWeight: 700,
                color: "var(--gold-on-light)",
                background: "var(--gold-soft)",
                border: "1px solid var(--gold-medium)",
              }}
            >
              {t("customBadge")}
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
  );
}

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
