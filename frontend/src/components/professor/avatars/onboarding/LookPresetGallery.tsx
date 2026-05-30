"use client";

import { useMemo, useState, type CSSProperties } from "react";
import {
  BACKGROUND_OPTIONS,
  CLOTHING_OPTIONS,
  LOOK_PRESETS,
  type LookBackground,
  type LookClothing,
  type LookPreset,
} from "./lookPresets";
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
 * "스타일 샘플 이미지" 룩 갤러리 — **복장 × 배경 2축 필터**로 탐색한다.
 *
 * HeyGen Design with AI 로 만든 실사 룩 썸네일(public/avatar-looks/*.jpg)을
 * 보여주고, 위쪽 두 줄의 필터(복장 / 배경)로 좁힌다. 카드를 누르면 해당 스타일
 * 프롬프트가 채워지고 바로 생성된다. 선택 카드는 골드 링 + 체크로 강조한다.
 */
export default function LookPresetGallery({
  selectedId,
  onPick,
  disabled,
  t,
}: LookPresetGalleryProps) {
  const [clothing, setClothing] = useState<LookClothing | null>(null);
  const [background, setBackground] = useState<LookBackground | null>(null);

  const filtered = useMemo(
    () =>
      LOOK_PRESETS.filter(
        (p) =>
          (clothing === null || p.clothing === clothing) &&
          (background === null || p.background === background),
      ),
    [clothing, background],
  );

  return (
    <div data-testid="look-preset-gallery">
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8 }}>
        <span style={galleryLabelStyle}>{t("looks.galleryLabel")}</span>
        <span style={galleryHintStyle}>{t("looks.galleryHint")}</span>
      </div>

      {/* 2축 필터 — 복장 / 배경 */}
      <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
        <FilterRow
          label="복장"
          options={CLOTHING_OPTIONS}
          value={clothing}
          onChange={(v) => setClothing(v as LookClothing | null)}
        />
        <FilterRow
          label="배경"
          options={BACKGROUND_OPTIONS}
          value={background}
          onChange={(v) => setBackground(v as LookBackground | null)}
        />
      </div>

      <p style={countNote} aria-live="polite" data-testid="look-preset-count">
        {filtered.length}개 스타일
      </p>

      <div style={gridStyle} role="group" aria-label={t("looks.galleryLabel")}>
        {filtered.map((preset) => {
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
                  alt={preset.label}
                  loading="lazy"
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
                {selected && (
                  <span style={selectedBadge} aria-hidden="true">
                    <CheckIcon size={13} mono style={{ color: "#0A0A0A" }} />
                  </span>
                )}
              </span>
              <span style={labelStyle} title={preset.label}>
                {preset.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 한 축(복장 또는 배경)의 필터 칩 행. "전체" + 각 옵션. 같은 칩 재클릭 시 해제. */
function FilterRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { key: string; label: string }[];
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
      <span style={filterRowLabel}>{label}</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <Chip active={value === null} onClick={() => onChange(null)}>
          전체
        </Chip>
        {options.map((o) => (
          <Chip
            key={o.key}
            active={value === o.key}
            onClick={() => onChange(value === o.key ? null : o.key)}
          >
            {o.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        ...chipStyle,
        background: active ? "var(--gold)" : "var(--bg-card)",
        color: active ? "#0A0A0A" : "var(--text-muted)",
        borderColor: active ? "var(--gold)" : "var(--line-strong)",
        fontWeight: active ? 700 : 500,
      }}
    >
      {children}
    </button>
  );
}

const galleryLabelStyle: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 600,
  color: "var(--text)",
};

const galleryHintStyle: CSSProperties = {
  fontSize: 11.5,
  color: "var(--text-muted)",
};

const filterRowLabel: CSSProperties = {
  flexShrink: 0,
  width: 34,
  paddingTop: 5,
  fontSize: 11.5,
  fontWeight: 700,
  color: "var(--text-muted)",
};

const chipStyle: CSSProperties = {
  padding: "4px 11px",
  fontSize: 11.5,
  borderRadius: 999,
  border: "1px solid",
  cursor: "pointer",
  fontFamily: "inherit",
  transition: "background 120ms var(--ease-out), border-color 120ms var(--ease-out)",
};

const countNote: CSSProperties = {
  margin: "10px 0 0",
  fontSize: 11,
  color: "var(--text-faint)",
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(108px, 1fr))",
  gap: 10,
  marginTop: 6,
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
