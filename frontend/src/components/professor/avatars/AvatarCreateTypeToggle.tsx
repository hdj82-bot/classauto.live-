"use client";

import type { CSSProperties } from "react";
import type { AvatarKind } from "./avatarsTypes";

interface AvatarCreateTypeToggleProps {
  value: AvatarKind;
  onChange: (kind: AvatarKind) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * 아바타 제작 방식 선택 — "포토 아바타" vs "표준 아바타" 세그먼트 토글.
 *
 *  - 포토 아바타: 본인 사진으로 만드는 Talking Photo(몸 고정·얼굴만 움직임). 현재 방식.
 *  - 표준 아바타: HeyGen 웹 스튜디오에서 만든 Video Avatar 의 avatar_id 를 등록
 *    (전신이 자연스럽게 움직임). 동일 분당 단가에서 기괴함을 줄이는 비교 대상.
 *
 * 선택에 따라 아래 제작 카드(PhotoAvatarStudioCard / StandardAvatarRegisterCard)가
 * 전환된다. 음성 선택 카드는 두 방식 공통이라 토글과 무관하게 유지된다.
 */
export default function AvatarCreateTypeToggle({
  value,
  onChange,
  t,
}: AvatarCreateTypeToggleProps) {
  const options: { kind: AvatarKind; label: string; desc: string }[] = [
    { kind: "photo", label: t("createTypePhotoLabel"), desc: t("createTypePhotoDesc") },
    {
      kind: "standard",
      label: t("createTypeStandardLabel"),
      desc: t("createTypeStandardDesc"),
    },
  ];

  return (
    <div data-testid="avatar-create-type-toggle" style={wrapStyle}>
      <span style={eyebrowStyle}>{t("createTypeTitle")}</span>
      <div role="radiogroup" aria-label={t("createTypeTitle")} style={rowStyle}>
        {options.map((o) => {
          const active = value === o.kind;
          return (
            <button
              key={o.kind}
              type="button"
              role="radio"
              aria-checked={active}
              data-testid={`create-type-${o.kind}`}
              onClick={() => onChange(o.kind)}
              style={optionStyle(active)}
            >
              <span style={optionLabelStyle(active)}>{o.label}</span>
              <span style={optionDescStyle}>{o.desc}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const wrapStyle: CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--line)",
  borderRadius: 16,
  padding: 18,
  boxShadow: "var(--shadow-sm)",
};

const eyebrowStyle: CSSProperties = {
  display: "block",
  marginBottom: 12,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-faint)",
};

const rowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

function optionStyle(active: boolean): CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    gap: 5,
    textAlign: "left",
    padding: "14px 16px",
    borderRadius: 12,
    cursor: "pointer",
    fontFamily: "inherit",
    background: active ? "var(--gold-soft)" : "var(--bg-subtle)",
    border: `2px solid ${active ? "var(--gold)" : "var(--line)"}`,
    boxShadow: active ? "0 0 0 3px var(--gold-medium)" : "none",
    transition:
      "border-color 140ms var(--ease-out), box-shadow 140ms var(--ease-out)",
  };
}

function optionLabelStyle(active: boolean): CSSProperties {
  return {
    fontSize: 14.5,
    fontWeight: 700,
    color: active ? "var(--gold-on-light)" : "var(--text)",
  };
}

const optionDescStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.5,
  color: "var(--text-muted)",
};
