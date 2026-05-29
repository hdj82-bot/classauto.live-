"use client";

import type { CSSProperties } from "react";
import type { Look } from "./photoAvatarTypes";
import { CheckIcon, PersonIcon } from "./PhotoAvatarIcons";

interface LookTileProps {
  look: Look;
  selected?: boolean;
  reducedMotion?: boolean;
  /** 제공되면 클릭으로 선택 가능. ready 가 아니면 비활성. */
  onSelect?: (lookId: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * 룩 1개 타일 — 생성 진행(generating) / 완료(ready) / 실패(failed) 상태를
 * 3:4 썸네일로 표현. 선택 가능하면 골드 링으로 강조한다.
 */
export default function LookTile({
  look,
  selected,
  reducedMotion,
  onSelect,
  t,
}: LookTileProps) {
  const selectable = !!onSelect && look.status === "ready";
  const Wrapper = selectable ? "button" : "div";

  return (
    <Wrapper
      type={selectable ? "button" : undefined}
      onClick={selectable ? () => onSelect?.(look.look_id) : undefined}
      aria-pressed={selectable ? !!selected : undefined}
      disabled={selectable ? false : undefined}
      data-testid={`look-tile-${look.look_id}`}
      data-status={look.status}
      style={{
        ...tileStyle,
        cursor: selectable ? "pointer" : "default",
        borderColor: selected ? "var(--gold)" : "var(--line)",
        boxShadow: selected ? "0 0 0 3px var(--gold-medium)" : "var(--shadow-sm)",
      }}
    >
      <span style={thumbStyle}>
        {look.status === "ready" && look.preview_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={look.preview_image_url}
            alt={look.prompt || t("looks.tileAlt")}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : look.status === "failed" ? (
          <span style={centerBox}>
            <PersonIcon size={30} mono style={{ color: "var(--text-faint)" }} />
            <span style={{ fontSize: 11, color: "var(--warning)", marginTop: 6 }}>
              {t("looks.tileFailed")}
            </span>
          </span>
        ) : (
          // generating
          <span style={centerBox}>
            {!reducedMotion ? (
              <span style={ringStyle} aria-hidden="true" />
            ) : (
              <PersonIcon size={28} mono style={{ color: "var(--text-faint)" }} />
            )}
            <span style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
              {t("looks.tileGenerating")}
            </span>
          </span>
        )}

        {selected && (
          <span style={selectedBadge} aria-hidden="true">
            <CheckIcon size={14} mono style={{ color: "#0A0A0A" }} />
          </span>
        )}
      </span>

      {look.prompt && (
        <span style={captionStyle} title={look.prompt}>
          {look.prompt}
        </span>
      )}
    </Wrapper>
  );
}

const tileStyle: CSSProperties = {
  display: "block",
  width: "100%",
  padding: 8,
  borderRadius: 14,
  border: "2px solid",
  background: "var(--bg-card)",
  textAlign: "left",
  fontFamily: "inherit",
  transition: "box-shadow 140ms var(--ease-out), border-color 140ms var(--ease-out)",
};

const thumbStyle: CSSProperties = {
  display: "block",
  position: "relative",
  width: "100%",
  aspectRatio: "3 / 4",
  borderRadius: 10,
  overflow: "hidden",
  background: "var(--bg-subtle)",
};

const centerBox: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
};

const ringStyle: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: "50%",
  border: "3px solid var(--gold-soft)",
  borderTopColor: "var(--gold)",
  animation: "studio-spin 0.9s linear infinite",
};

const selectedBadge: CSSProperties = {
  position: "absolute",
  top: 8,
  right: 8,
  width: 24,
  height: 24,
  borderRadius: "50%",
  background: "var(--gold)",
  display: "grid",
  placeItems: "center",
  boxShadow: "var(--shadow-sm)",
};

const captionStyle: CSSProperties = {
  display: "block",
  marginTop: 8,
  fontSize: 11.5,
  lineHeight: 1.4,
  color: "var(--text-muted)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
