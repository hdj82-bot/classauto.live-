"use client";

import type { CSSProperties } from "react";
import type { Avatar } from "./avatarsTypes";
import type { VoiceOption } from "./voicePresets";

interface AvatarBuilderBarProps {
  /** 아바타 제작에 쓸 룩(라이브러리에서 "아바타 제작에 사용"으로 확정). */
  look: Avatar | null;
  /** 아래 음성 패널에서 최종 선택한 음성. */
  voice: VoiceOption | null;
  /** "룩과 목소리 아바타 제작" — 룩+음성으로 아바타 제작(빌더 열기·렌더). */
  onCreate: () => void;
  creating?: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * 페이지 우측 상단 빌더 바 — (룩 박스) + (음성 박스) + "룩과 목소리 아바타 제작".
 *
 * 아바타 = 룩 + 음성. 라이브러리에서 룩을, 아래 음성 패널에서 음성을 각각 최종
 * 선택하면 두 박스가 채워지고, 둘 다 차면 제작 버튼이 활성화된다. 제작 버튼은
 * 강의에 곧바로 적용하지 않고, 아래 "아바타 제작" 작업대(AvatarBuildStudio)를 열어
 * HeyGen 으로 말하는 아바타를 만들고 스크립트로 확인한 뒤 강의에 적용하게 한다.
 */
export default function AvatarBuilderBar({
  look,
  voice,
  onCreate,
  creating = false,
  t,
}: AvatarBuilderBarProps) {
  const ready = !!look && !!voice;

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
      <div data-testid="builder-voice-box" style={slotStyle(!!voice)}>
        <span style={slotEyebrowStyle}>{t("builderVoiceLabel")}</span>
        {voice ? (
          <div style={slotBodyStyle}>
            <span aria-hidden="true" style={voiceIconStyle}>
              🔊
            </span>
            <span style={slotNameStyle} title={voice.name}>
              {voice.name}
            </span>
          </div>
        ) : (
          <span style={slotEmptyStyle}>{t("builderVoiceEmpty")}</span>
        )}
      </div>

      {/* 제작 버튼 */}
      <button
        type="button"
        onClick={onCreate}
        disabled={!ready || creating}
        data-testid="builder-create"
        style={{
          ...createBtnStyle,
          opacity: !ready || creating ? 0.5 : 1,
          cursor: !ready || creating ? "not-allowed" : "pointer",
        }}
        title={ready ? undefined : t("builderCreateHint")}
      >
        {creating ? t("builderCreating") : t("builderCreate")}
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
    minWidth: 132,
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
