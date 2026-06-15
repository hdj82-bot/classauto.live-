"use client";

import type { CSSProperties } from "react";

interface CurrentAvatarChipProps {
  /** 표시 이름 (없으면 기본 라벨). */
  name: string;
  /** 미리보기 썸네일 이미지 URL (없으면 이름 이니셜 폴백). */
  imageUrl: string | null;
  t: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * 빌더 바 우측의 "현재 지정된 아바타" 칩 — 현재 강의에 적용돼 있는 Q&A 아바타를
 * 썸네일 + 이름으로 보여 준다. 어떤 아바타가 선택돼 있는지 "식별"만 하는 표시 전용
 * 요소다(재생·선택·적용 동작 없음).
 */
export default function CurrentAvatarChip({
  name,
  imageUrl,
  t,
}: CurrentAvatarChipProps) {
  return (
    <div data-testid="current-avatar-chip" style={chipStyle}>
      <span style={eyebrowStyle}>{t("currentAvatarLabel")}</span>
      <div style={bodyStyle}>
        <span style={thumbStyle}>
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt={name} style={fillStyle} />
          ) : (
            <span aria-hidden="true" style={initialStyle}>
              {name.slice(0, 1)}
            </span>
          )}
        </span>
        <span style={nameStyle} title={name}>
          {name}
        </span>
      </div>
    </div>
  );
}

const chipStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: 5,
  minWidth: 150,
  maxWidth: 230,
  padding: "8px 12px",
  borderRadius: 12,
  background: "var(--bg-card)",
  border: "1px solid var(--line-strong)",
};

const eyebrowStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-faint)",
};

const bodyStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  minWidth: 0,
};

const thumbStyle: CSSProperties = {
  position: "relative",
  width: 40,
  height: 40,
  flexShrink: 0,
  borderRadius: 9,
  overflow: "hidden",
  background: "var(--bg-subtle)",
  border: "1px solid var(--gold-medium)",
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
  fontSize: 16,
  fontWeight: 700,
  color: "var(--text-faint)",
};

const nameStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "var(--text)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
