"use client";

import { useMemo, useState, type CSSProperties } from "react";
import {
  LOOK_TOTAL_MAX,
  type Look,
  type LookGenerateInput,
} from "./photoAvatarTypes";
import { PersonIcon, SparkleIcon } from "./PhotoAvatarIcons";
import LookTile from "./LookTile";
import LookDetailModal from "./LookDetailModal";
import LookOptionForm from "./LookOptionForm";

interface LookSelectStepProps {
  looks: Look[];
  selectedLookId: string | null;
  /** 기본 룩 선택(POST select). */
  onSelect: (lookId: string) => void;
  /** 16:9 모달 안에서 미세 조정 재생성. */
  onGenerate?: (input: LookGenerateInput) => Promise<void>;
  /** 룩 삭제(타일 ⋮ 메뉴 + 16:9 모달). */
  onDelete?: (lookId: string) => Promise<void>;
  /** 후보 룩을 라이브러리에 저장(타일 ⋮ 메뉴). */
  onSave?: (lookId: string) => Promise<void>;
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
 * ready 룩만 노출한다. 타일 클릭 시 즉시 선택되고(낙관적) 동시에 상세 모달이
 * 열려 큰 화면 확인·미세 조정 재생성·삭제가 가능하다(2026-06-01).
 *
 * 2026-06-01 v2: "룩 생성 폼이 사라졌다" 보고 → 갤러리 아래에 ``LookOptionForm``
 * 을 인라인 임베드한다. ``onGenerate`` 가 주어지면 사용자가 별도 단계로 이동하지
 * 않고 이 화면에서 곧장 새 배치를 생성할 수 있다. cap 도달 시 form 은 안내만
 * 표시한다(LookOptionForm 자체 동작).
 */
export default function LookSelectStep({
  looks,
  selectedLookId,
  onSelect,
  onGenerate,
  onDelete,
  onSave,
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
  const visibleLooks = useMemo(
    () => looks.filter((l) => l.status !== "failed"),
    [looks],
  );
  // 인라인 생성 폼의 누적 cap — failed 제외(백엔드 계산과 동일).
  const remaining = Math.max(0, LOOK_TOTAL_MAX - visibleLooks.length);
  const capReached = remaining <= 0;

  const [activeLookId, setActiveLookId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const activeLook =
    activeLookId !== null
      ? readyLooks.find((l) => l.look_id === activeLookId) ?? null
      : null;

  // 타일 클릭: 선택(기존) + 모달 오픈(신규). 둘 다 같은 핸들러에서 처리한다.
  const handleTileClick = (lookId: string) => {
    onSelect(lookId);
    setActiveLookId(lookId);
  };

  // ⋮ 메뉴 — 큰 모달 없이 바로 삭제(가벼운 confirm)/라이브러리 저장.
  const handleMenuDelete = (lookId: string) => {
    if (!onDelete) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(t("looks.detail.deleteConfirm"))
    ) {
      return;
    }
    void onDelete(lookId);
  };
  const handleMenuSave = onSave ? (lookId: string) => void onSave(lookId) : undefined;

  // 모달이 재생성을 위임받았을 때 — 비어 있으면 no-op.
  const handleRegenerate = async (input: LookGenerateInput) => {
    if (onGenerate) await onGenerate(input);
  };

  // 인라인 폼이 새 배치 생성을 의뢰. cap 도달이면 비활성.
  const handleInlineGenerate = async (input: LookGenerateInput) => {
    if (!onGenerate || capReached || generating || looksPending) return;
    setGenerating(true);
    try {
      await onGenerate(input);
    } finally {
      setGenerating(false);
    }
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
              onDelete={onDelete ? handleMenuDelete : undefined}
              onSave={handleMenuSave}
              t={t}
            />
          ))}
        </div>
      )}

      {onGenerate && (
        <section style={inlineGenSection} data-testid="select-inline-generate">
          <div style={inlineGenHeading}>
            <SparkleIcon size={20} />
            <h3 style={inlineGenTitle}>{t("looks.title")}</h3>
          </div>
          <p style={inlineGenDesc}>{t("looks.description")}</p>
          <LookOptionForm
            onGenerate={handleInlineGenerate}
            disabled={generating || looksPending}
            capReached={capReached}
            t={t}
          />
          <p style={inlineGenNote} data-testid="select-cost-note">{t("looks.costNote")}</p>
        </section>
      )}

      <div style={footerStyle}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
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

      {/* onGenerate 가 없는 fallback 경로(임베드 카드 일부) — 별도 단계로 이동. */}
      {!onGenerate && (
        <button
          type="button"
          onClick={onBack}
          style={{ ...secondaryBtn, marginTop: 12 }}
          data-testid="select-back"
        >
          {t("select.generateMore")}
        </button>
      )}

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

const inlineGenSection: CSSProperties = {
  marginTop: 22,
  padding: "18px 18px 14px",
  borderRadius: 14,
  border: "1px solid var(--line)",
  background: "var(--bg-subtle)",
};

const inlineGenHeading: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  marginBottom: 4,
};

const inlineGenTitle: CSSProperties = {
  margin: 0,
  fontSize: 15.5,
  fontWeight: 700,
  color: "var(--text)",
};

const inlineGenDesc: CSSProperties = {
  margin: "0 0 12px",
  fontSize: 12.5,
  lineHeight: 1.55,
  color: "var(--text-muted)",
};

const inlineGenNote: CSSProperties = {
  margin: "10px 0 0",
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1.5,
  color: "#D92D20",
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
