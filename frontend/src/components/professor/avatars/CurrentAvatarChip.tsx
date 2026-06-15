"use client";

import { useState } from "react";
import type { CSSProperties } from "react";

interface CurrentAvatarChipProps {
  /** 표시 이름 (없으면 기본 라벨). */
  name: string;
  /** 미리보기 썸네일 이미지 URL. */
  imageUrl: string | null;
  /** 미리보기 루프 영상 URL — 있으면 썸네일 클릭 시 그 자리에서 재생. */
  videoUrl: string | null;
  reducedMotion: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * 빌더 바 우측의 "현재 지정된 아바타" 칩 — 현재 강의에 적용돼 있는 Q&A 아바타를
 * 썸네일 + 이름으로 보여 준다. 영상 미리보기가 있으면 클릭으로 그 자리에서 재생한다
 * (AvatarBuilderBar 룩 박스와 동일 톤). 텍스트만으로는 어떤 아바타인지 알기 어렵다는
 * 피드백에 따른 표시 전용 요소 — 선택/적용 동작은 없다.
 */
export default function CurrentAvatarChip({
  name,
  imageUrl,
  videoUrl,
  reducedMotion,
  t,
}: CurrentAvatarChipProps) {
  const [playing, setPlaying] = useState(false);
  const canPlay = !!videoUrl;

  return (
    <div data-testid="current-avatar-chip" style={chipStyle}>
      <span style={eyebrowStyle}>{t("currentAvatarLabel")}</span>
      <div style={bodyStyle}>
        <button
          type="button"
          onClick={() => canPlay && setPlaying((p) => !p)}
          aria-label={
            canPlay ? t("currentAvatarPlay", { name }) : name
          }
          style={{
            ...thumbStyle,
            cursor: canPlay ? "pointer" : "default",
          }}
        >
          {playing && videoUrl ? (
            <video
              src={videoUrl}
              autoPlay
              loop
              muted
              playsInline
              // 사용자가 직접 클릭해 연 재생이므로 reduced-motion 이어도 재생하되,
              // 컨트롤 없이 칩 안에서만 루프한다. 다시 클릭하면 썸네일로 돌아간다.
              style={fillStyle}
            />
          ) : imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt={name} style={fillStyle} />
          ) : (
            <span aria-hidden="true" style={initialStyle}>
              {name.slice(0, 1)}
            </span>
          )}
          {canPlay && !playing && (
            <span aria-hidden="true" style={playBadgeStyle}>
              <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          )}
        </button>
        <span style={nameStyle} title={name}>
          {name}
        </span>
      </div>
      {!reducedMotion && canPlay && !playing && (
        <span style={hintStyle}>{t("currentAvatarPlayHint")}</span>
      )}
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
  padding: 0,
  fontFamily: "inherit",
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

const playBadgeStyle: CSSProperties = {
  position: "absolute",
  right: 2,
  bottom: 2,
  display: "grid",
  placeItems: "center",
  width: 15,
  height: 15,
  borderRadius: 999,
  background: "rgba(10,10,10,0.62)",
  color: "#fff",
};

const nameStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "var(--text)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const hintStyle: CSSProperties = {
  fontSize: 10.5,
  color: "var(--text-faint)",
};
