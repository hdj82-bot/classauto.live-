"use client";

import { useMemo, useState, type CSSProperties } from "react";
import type { Look, LookGenerateInput } from "./photoAvatarTypes";
import { PersonIcon } from "./PhotoAvatarIcons";
import LookTile from "./LookTile";
import LookDetailModal from "./LookDetailModal";

interface LookSelectStepProps {
  looks: Look[];
  selectedLookId: string | null;
  /** 기본 룩 선택(POST select). */
  onSelect: (lookId: string) => void;
  /** 16:9 모달 안에서 미세 조정 재생성. */
  onGenerate?: (input: LookGenerateInput) => Promise<void>;
  /** 16:9 모달 안에서 룩 삭제. */
  onDelete?: (lookId: string) => Promise<void>;
  /** 모달 재생성용 base. */
  lastInput?: LookGenerateInput | null;
  /** generating 룩이 있을 때 모달 동작 disable. */
  looksPending?: boolean;
  reducedMotion: boolean;
  /** ③ 으로 돌아가 추가 생성. */
  onBack: () => void;
  /** ① 업로드로 되돌아가 다른 사진으로 다시 시작. */
  onRestart: () => void;
  /** ⑤ 미리보기로. 선택된 룩이 있어야 활성. */
  onNext: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * ④ 룩 갤러리에서 기본 룩 1개 선택.
 *
 * ready 룩만 노출한다. 타일 클릭 시 즉시 선택되고(낙관적) 동시에 16:9 상세
 * 모달이 열려 큰 화면 확인·미세 조정 재생성·삭제가 가능하다(2026-06-01 정책).
 * "추가 생성"은 ③ 단계로 되돌아간다.
 */
export default function LookSelectStep({
  looks,
  selectedLookId,
  onSelect,
  onGenerate,
  onDelete,
  lastInput = null,
  looksPending = false,
  reducedMotion,
  onBack,
  onRestart,
  onNext,
  t,
}: LookSelectStepProps) {
  const readyLooks = useMemo(
    () => looks.filter((l) => l.status === "ready"),
    [looks],
  );
  const [activeLookId, setActiveLookId] = useState<string | null>(null);
  const activeLook =
    activeLookId !== null
      ? readyLooks.find((l) => l.look_id === activeLookId) ?? null
      : null;

  // 타일 클릭: 선택(기존) + 모달 오픈(신규). 둘 다 같은 핸들러에서 처리한다.
  const handleTileClick = (lookId: string) => {
    onSelect(lookId);
    setActiveLookId(lookId);
  };

  // 모달이 재생성을 위임받았을 때 — 비어 있으면 no-op.
  const handleRegenerate = async (input: LookGenerateInput) => {
    if (onGenerate) await onGenerate(input);
  };

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
              onSelect={handleTileClick}
              t={t}
            />
          ))}
        </div>
      )}

      <div style={footerStyle}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
          <button type="button" onClick={onBack} style={secondaryBtn} data-testid="select-back">
            {t("select.generateMore")}
          </button>
          <button type="button" onClick={onRestart} style={ghostLink} data-testid="select-restart">
            {t("select.restart")}
          </button>
        </div>
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

      {activeLook && (
        <LookDetailModal
          look={activeLook}
          lastInput={lastInput}
          onRegenerate={handleRegenerate}
          onDelete={onDelete}
          onClose={() => setActiveLookId(null)}
          busy={looksPending}
          t={t}
        />
      )}
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

const ghostLink: CSSProperties = {
  padding: "4px 8px",
  fontSize: 12,
  fontWeight: 500,
  borderRadius: 8,
  border: "none",
  background: "transparent",
  color: "var(--text-subtle)",
  cursor: "pointer",
  fontFamily: "inherit",
  textDecoration: "underline",
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
