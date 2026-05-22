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
  /** prefers-reduced-motion — true 면 영상 자동재생 안 함(썸네일만). */
  reducedMotion: boolean;
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

export default function AvatarCard({
  avatar,
  selected,
  onSelect,
  reducedMotion,
  renameEnabled,
  onRename,
  t,
}: AvatarCardProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(avatar.name);

  const hasVideo = !!avatar.preview_video_url;
  const shouldPlay = !reducedMotion && hasVideo && (hovered || selected);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    // play()/pause() 는 환경에 따라(자동재생 정책 거부, jsdom 미구현) 동기/비동기
    // 예외를 던질 수 있어 전부 무시한다 — 실패 시 poster 썸네일이 남는다.
    try {
      if (shouldPlay) {
        const p = v.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      } else {
        v.pause();
        v.currentTime = 0; // 다음 hover 때 처음부터 재생되도록 되감기.
      }
    } catch {
      /* no-op */
    }
  }, [shouldPlay]);

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
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
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
          {hasVideo ? (
            <video
              ref={videoRef}
              src={avatar.preview_video_url ?? undefined}
              poster={avatar.preview_image_url ?? undefined}
              muted
              loop
              playsInline
              preload="none"
              aria-hidden="true"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
          ) : avatar.preview_image_url ? (
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

          {/* 재생/정지 인디케이터 — 모션 환경에서만 의미 */}
          {hasVideo && (
            <span
              style={{
                position: "absolute",
                bottom: 6,
                right: 6,
                padding: "2px 7px",
                borderRadius: 999,
                fontSize: 10,
                fontWeight: 600,
                color: "#fff",
                background: "rgba(10,10,10,0.55)",
                backdropFilter: "blur(2px)",
              }}
            >
              {reducedMotion
                ? t("previewStatic")
                : shouldPlay
                  ? t("previewPlaying")
                  : t("playPreview")}
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
