"use client";

import type { CSSProperties } from "react";
import { LOOK_PRESETS, type LookPreset } from "./lookPresets";
import { CheckIcon } from "./PhotoAvatarIcons";

interface LookPresetGalleryProps {
  /** 현재 강조된(채워진) 프리셋 id. textarea 를 직접 고치면 부모가 null 로 해제. */
  selectedId: string | null;
  /** 카드 클릭 → 프롬프트 채움 + 즉시 생성. */
  onPick: (preset: LookPreset) => void;
  /** 생성 진행/한도 도달 등으로 새 생성을 막을 때 — 카드 비활성. */
  disabled: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * "스타일 샘플 이미지" 룩 갤러리 — 텍스트 칩을 대체한다(차별점: 결과 가늠).
 *
 * 카드(썸네일 + 라벨)를 누르면 해당 스타일 프롬프트가 채워지고 바로 생성된다.
 * 썸네일은 ``public/avatar-looks/<id>.svg`` 폴백(라이트 베이지 + 골드, design
 * -system v2)이며, 실제 사진으로 파일만 교체하면 그대로 바뀐다. 선택된 카드는
 * 골드 링 + 체크로 강조(색 + 모양 이중 표시, 색맹 친화).
 */
export default function LookPresetGallery({
  selectedId,
  onPick,
  disabled,
  t,
}: LookPresetGalleryProps) {
  return (
    <div data-testid="look-preset-gallery">
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8 }}>
        <span style={galleryLabel}>{t("looks.galleryLabel")}</span>
        <span style={galleryHint}>{t("looks.galleryHint")}</span>
      </div>

      <div style={gridStyle} role="group" aria-label={t("looks.galleryLabel")}>
        {LOOK_PRESETS.map((preset) => {
          const label = t(preset.labelKey);
          const selected = selectedId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onPick(preset)}
              disabled={disabled}
              aria-pressed={selected}
              data-testid={`look-preset-${preset.id}`}
              style={{
                ...cardStyle,
                borderColor: selected ? "var(--gold)" : "var(--line)",
                boxShadow: selected ? "0 0 0 3px var(--gold-medium)" : "var(--shadow-sm)",
                opacity: disabled ? 0.5 : 1,
                cursor: disabled ? "not-allowed" : "pointer",
              }}
            >
              <span style={thumbStyle}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preset.image}
                  alt={label}
                  loading="lazy"
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
                {selected && (
                  <span style={selectedBadge} aria-hidden="true">
                    <CheckIcon size={13} mono style={{ color: "#0A0A0A" }} />
                  </span>
                )}
              </span>
              <span style={labelStyle} title={label}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const galleryLabel: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 600,
  color: "var(--text)",
};

const galleryHint: CSSProperties = {
  fontSize: 11.5,
  color: "var(--text-muted)",
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(108px, 1fr))",
  gap: 10,
  marginTop: 10,
};

const cardStyle: CSSProperties = {
  display: "block",
  width: "100%",
  padding: 6,
  borderRadius: 12,
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
  borderRadius: 8,
  overflow: "hidden",
  background: "var(--bg-subtle)",
};

const selectedBadge: CSSProperties = {
  position: "absolute",
  top: 6,
  right: 6,
  width: 22,
  height: 22,
  borderRadius: "50%",
  background: "var(--gold)",
  display: "grid",
  placeItems: "center",
  boxShadow: "var(--shadow-sm)",
};

const labelStyle: CSSProperties = {
  display: "block",
  marginTop: 7,
  fontSize: 11.5,
  lineHeight: 1.35,
  fontWeight: 500,
  color: "var(--text)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
