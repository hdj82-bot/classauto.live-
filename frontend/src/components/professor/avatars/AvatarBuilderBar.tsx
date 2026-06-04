"use client";

import type { CSSProperties } from "react";
import type { Avatar } from "./avatarsTypes";

interface AvatarBuilderBarProps {
  /** "아바타 제작에 사용"으로 고른 룩(선택 아바타). */
  look: Avatar | null;
  /** 본인 목소리/샘플 보이스 중 "아바타 제작에 사용"으로 고른 음성 이름. */
  voiceName: string | null;
  /**
   * "룩과 목소리 아바타 제작" — 아래 작업대를 열어 그 자리에서 아바타 영상을
   * 렌더하고 성능을 확인한다(강의 적용은 작업대 안에서).
   */
  onCreate: () => void;
  creating: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * 페이지 우측 상단 빌더 바 — (룩 박스) + (음성 박스) + "룩과 목소리 아바타 제작".
 *
 * 아바타 = 룩 + 음성. 라이브러리에서 "아바타 제작에 사용"으로 룩을, 아래 음성
 * 패널에서 "이 음성을 아바타 제작에 사용"으로 음성을 고르면 두 박스가 채워진다.
 * 제작 버튼을 누르면 아래 작업대가 열려 그 자리에서 말하는 아바타를 만들고
 * 성능을 확인한 뒤 강의에 적용한다(강의 컨텍스트는 적용 단계에서만 필요).
 */
export default function AvatarBuilderBar({
  look,
  voiceName,
  onCreate,
  creating,
  t,
}: AvatarBuilderBarProps) {
  // 렌더는 강의 없이도 가능 — 룩 + 음성이 모두 골라지면 활성화.
  const disabled = !look || !voiceName || creating;

  return (
    <div data-testid="avatar-builder-bar" style={barStyle}>
      {/* 박스1: 룩 */}
      <div data-testid="builder-look-box" style={slotStyle(!!look)}>
        <span style={slotEyebrowStyle}>{t("builderLookLabel")}</span>
        {look ? (
          <div style={slotBodyStyle}>
            <span style={lookThumbStyle}>
              {look.preview_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={look.preview_image_url} alt={look.name} style={fillStyle} />
              ) : (
                <span aria-hidden="true" style={thumbInitialStyle}>
                  {look.name.slice(0, 1)}
                </span>
              )}
            </span>
            <span style={slotNameStyle} title={look.name}>
              {look.name}
            </span>
          </div>
        ) : (
          <span style={slotEmptyStyle}>{t("builderLookEmpty")}</span>
        )}
      </div>

      <span aria-hidden="true" style={plusStyle}>
        +
      </span>

      {/* 박스2: 음성 */}
      <div data-testid="builder-voice-box" style={slotStyle(!!voiceName)}>
        <span style={slotEyebrowStyle}>{t("builderVoiceLabel")}</span>
        {voiceName ? (
          <div style={slotBodyStyle}>
            <span aria-hidden="true" style={voiceIconStyle}>
              🔊
            </span>
            <span style={slotNameStyle} title={voiceName}>
              {voiceName}
            </span>
          </div>
        ) : (
          <span style={slotEmptyStyle}>{t("builderVoiceEmpty")}</span>
        )}
      </div>

      {/* 제작 버튼 — 아래 작업대를 열어 그 자리에서 아바타를 렌더·확인한다. */}
      <button
        type="button"
        onClick={onCreate}
        disabled={disabled}
        data-testid="avatars-apply"
        style={{
          ...createBtnStyle,
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
        title={disabled && !creating ? t("builderCreateHint") : undefined}
      >
        {creating ? t("creating") : t("createAvatar")}
      </button>
    </div>
  );
}

const barStyle: CSSProperties = {
  display: "flex",
  alignItems: "stretch",
  flexWrap: "wrap",
  gap: 10,
};

function slotStyle(filled: boolean): CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: 4,
    minWidth: 124,
    maxWidth: 180,
    padding: "8px 12px",
    borderRadius: 12,
    background: filled ? "var(--gold-soft)" : "var(--bg-subtle)",
    border: `1px solid ${filled ? "var(--gold-medium)" : "var(--line)"}`,
  };
}

const slotEyebrowStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-faint)",
};

const slotBodyStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minWidth: 0,
};

const lookThumbStyle: CSSProperties = {
  position: "relative",
  width: 28,
  height: 28,
  flexShrink: 0,
  borderRadius: 7,
  overflow: "hidden",
  background: "var(--bg-card)",
  border: "1px solid var(--gold-medium)",
};

const fillStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const thumbInitialStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "grid",
  placeItems: "center",
  fontSize: 13,
  fontWeight: 700,
  color: "var(--text-faint)",
};

const voiceIconStyle: CSSProperties = {
  fontSize: 14,
  flexShrink: 0,
};

const slotNameStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "var(--text)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const slotEmptyStyle: CSSProperties = {
  fontSize: 12.5,
  color: "var(--text-subtle)",
};

const plusStyle: CSSProperties = {
  alignSelf: "center",
  fontSize: 16,
  fontWeight: 700,
  color: "var(--text-faint)",
};

const createBtnStyle: CSSProperties = {
  alignSelf: "center",
  padding: "12px 20px",
  fontSize: 14,
  fontWeight: 700,
  borderRadius: 12,
  border: "1px solid transparent",
  background: "linear-gradient(135deg, #FFB627, #E89E0E)",
  color: "#0A0A0A",
  fontFamily: "inherit",
  whiteSpace: "nowrap",
};
