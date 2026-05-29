"use client";

import { useMemo, type CSSProperties } from "react";
import type { Look } from "./photoAvatarTypes";
import { PersonIcon } from "./PhotoAvatarIcons";
import LookTile from "./LookTile";

interface LookSelectStepProps {
  looks: Look[];
  selectedLookId: string | null;
  /** 기본 룩 선택(POST select). */
  onSelect: (lookId: string) => void;
  reducedMotion: boolean;
  /** ③ 으로 돌아가 추가 생성. */
  onBack: () => void;
  /** ⑤ 미리보기로. 선택된 룩이 있어야 활성. */
  onNext: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * ④ 룩 갤러리에서 기본 룩 1개 선택.
 *
 * ready 룩만 선택 대상으로 노출한다. "추가 생성"은 명시 버튼으로 ③ 단계로
 * 되돌아간다(자동 재생성 없음 — docs §8).
 */
export default function LookSelectStep({
  looks,
  selectedLookId,
  onSelect,
  reducedMotion,
  onBack,
  onNext,
  t,
}: LookSelectStepProps) {
  const readyLooks = useMemo(
    () => looks.filter((l) => l.status === "ready"),
    [looks],
  );

  return (
    <div data-testid="step-select" style={cardStyle}>
      <h2 style={headingStyle}>{t("select.title")}</h2>
      <p style={descStyle}>{t("select.description")}</p>

      {readyLooks.length === 0 ? (
        <div style={emptyBox} data-testid="select-empty">
          <PersonIcon size={34} mono style={{ color: "var(--text-faint)" }} />
          <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
            {t("select.empty")}
          </p>
        </div>
      ) : (
        <div style={gridStyle} data-testid="select-grid">
          {readyLooks.map((look) => (
            <LookTile
              key={look.look_id}
              look={look}
              selected={selectedLookId === look.look_id}
              reducedMotion={reducedMotion}
              onSelect={onSelect}
              t={t}
            />
          ))}
        </div>
      )}

      <div style={footerStyle}>
        <button type="button" onClick={onBack} style={secondaryBtn} data-testid="select-back">
          {t("select.generateMore")}
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!selectedLookId}
          data-testid="select-next"
          style={{
            ...primaryBtn,
            opacity: selectedLookId ? 1 : 0.45,
            cursor: selectedLookId ? "pointer" : "not-allowed",
          }}
        >
          {t("select.next")}
        </button>
      </div>
    </div>
  );
}

const cardStyle: CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--line)",
  borderRadius: 16,
  padding: 24,
  boxShadow: "var(--shadow-sm)",
};

const headingStyle: CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 700,
  color: "var(--text)",
};

const descStyle: CSSProperties = {
  margin: "6px 0 18px",
  fontSize: 13.5,
  lineHeight: 1.6,
  color: "var(--text-muted)",
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
  gap: 16,
};

const emptyBox: CSSProperties = {
  borderRadius: 14,
  border: "1px dashed var(--line-strong)",
  background: "var(--bg-subtle)",
  padding: 32,
  textAlign: "center",
};

const footerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  marginTop: 22,
  flexWrap: "wrap",
};

const secondaryBtn: CSSProperties = {
  padding: "10px 16px",
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 10,
  border: "1px solid var(--line-strong)",
  background: "var(--bg-card)",
  color: "var(--text)",
  cursor: "pointer",
  fontFamily: "inherit",
};

const primaryBtn: CSSProperties = {
  padding: "10px 18px",
  fontSize: 13,
  fontWeight: 700,
  borderRadius: 10,
  border: "1px solid transparent",
  background: "linear-gradient(135deg, #FFB627, #E89E0E)",
  color: "#0A0A0A",
  fontFamily: "inherit",
};
