"use client";

import { useMemo, useState, type CSSProperties } from "react";
import {
  LOOK_TOTAL_MAX,
  type Look,
  type LookGenerateInput,
} from "./photoAvatarTypes";
import { SparkleIcon } from "./PhotoAvatarIcons";
import LookTile from "./LookTile";
import LookOptionForm from "./LookOptionForm";
import LookDetailModal from "./LookDetailModal";

interface LookGenerateStepProps {
  looks: Look[];
  /** 구조화 옵션으로 룩 배치를 생성한다(v0.2). */
  onGenerate: (input: LookGenerateInput) => Promise<void>;
  /** 룩 1개를 삭제(타일 ⋮ 메뉴 + LookDetailModal). */
  onDelete?: (lookId: string) => Promise<void>;
  /** 후보 룩을 라이브러리에 저장(타일 ⋮ 메뉴). */
  onSave?: (lookId: string) => Promise<void>;
  /** 생성이 진행 중인지(generating 타일 존재). */
  looksPending: boolean;
  /** 직전 배치 입력 — LookDetailModal 의 재생성 base. */
  lastInput: LookGenerateInput | null;
  reducedMotion: boolean;
  /** ③ 룩 선택 단계로. ready 룩이 1개 이상일 때 활성. */
  onNext: () => void;
  /** ① 업로드로 되돌아가 다른 사진으로 다시 시작. */
  onRestart: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * ② 구조화 옵션(persona/outfit/background/expression)으로 룩 배치를
 * 생성한다(v0.2 gpt-image-2). 누적 상한(LOOK_TOTAL_MAX)으로 과생성을 막고,
 * 완성된 룩이 생기면 "다음: 룩 선택" 으로 ③ 선택 단계로 이어진다.
 *
 * 표시 정책(2026-06-01):
 * - **실패한 룩은 갤러리에서 숨긴다** — 카드가 계속 남아 시각적 노이즈가 되는
 *   문제를 해결한다. 백엔드의 cap 계산도 failed 를 제외하므로 정합한다.
 * - 완성된 룩을 클릭하면 16:9 상세 모달이 열리고, 그 안에서만 "추가 요청"
 *   필드로 미세 조정 재생성이 가능하다.
 */
export default function LookGenerateStep({
  looks,
  onGenerate,
  onDelete,
  onSave,
  looksPending,
  lastInput,
  reducedMotion,
  onNext,
  onRestart,
  t,
}: LookGenerateStepProps) {
  const [submitting, setSubmitting] = useState(false);
  const [activeLookId, setActiveLookId] = useState<string | null>(null);

  // failed 는 표시에서 제외(누적 cap 도 백엔드가 failed 제외하므로 일관).
  const visibleLooks = useMemo(
    () => looks.filter((l) => l.status !== "failed"),
    [looks],
  );
  // 누적 상한은 visibleLooks(=non-failed) 기준 — 백엔드 계산과 일치.
  const remaining = Math.max(0, LOOK_TOTAL_MAX - visibleLooks.length);
  const capReached = remaining <= 0;
  const readyCount = visibleLooks.filter((l) => l.status === "ready").length;
  const busy = submitting || looksPending;

  const activeLook =
    activeLookId !== null
      ? visibleLooks.find((l) => l.look_id === activeLookId) ?? null
      : null;

  const handleGenerate = async (input: LookGenerateInput) => {
    if (busy || capReached) return;
    setSubmitting(true);
    try {
      await onGenerate(input);
    } finally {
      setSubmitting(false);
    }
  };

  // 모달의 "추가 요청" 재생성 — 진행 중(busy)이어도 막지 않는다(backend 가 누적
  // cap 으로 통제). 한도 도달일 때만 막는다. 모달이 자체 submitting 을 관리하므로
  // 여기선 setSubmitting 을 건드리지 않는다(인라인 폼 버튼과 독립).
  const handleRegenerate = async (input: LookGenerateInput) => {
    if (capReached) return;
    await onGenerate(input);
  };

  // ready 타일 클릭 = 상세 모달. 삭제/저장은 타일 우상단 ⋮ 메뉴로 처리한다.
  const handleTileClick = (id: string) => setActiveLookId(id);

  // ⋮ 메뉴 삭제 — 큰 모달을 열지 않고 바로 삭제(가벼운 confirm 만).
  const handleMenuDelete = (id: string) => {
    if (!onDelete) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(t("looks.detail.deleteConfirm"))
    ) {
      return;
    }
    void onDelete(id);
  };
  const handleMenuSave = onSave ? (id: string) => void onSave(id) : undefined;

  return (
    <div data-testid="step-generate" style={cardStyle}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 6,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <SparkleIcon size={26} />
          <h2 style={headingStyle}>{t("looks.title")}</h2>
        </div>
        <button
          type="button"
          onClick={onRestart}
          style={ghostLink}
          data-testid="generate-restart"
        >
          {t("looks.restart")}
        </button>
      </div>
      <p style={descStyle}>{t("looks.description")}</p>

      {/* 구조화 옵션 폼 — 칩 선택 후 "룩 N장 생성" (extra 는 없음) */}
      <LookOptionForm
        onGenerate={handleGenerate}
        disabled={busy}
        capReached={capReached}
        t={t}
      />

      {/* 안내 — 항상 노출하는 굵은 빨간 안내문구(생성 한도·정리 규칙). */}
      <p style={costNote} data-testid="looks-cost-note">{t("looks.costNote")}</p>

      {/* 생성 중에는 "창 닫아도 계속됨" 안내를 띄운다(사용자 요청 2026-06-02). */}
      {looksPending && (
        <p style={backgroundNote} data-testid="looks-background-note">
          {t("looks.backgroundNote")}
        </p>
      )}

      {/* 진행/완료 타일 (failed 제외) */}
      {visibleLooks.length > 0 && (
        <>
          <div style={gridStyle} data-testid="look-grid">
            {visibleLooks.map((look) => (
              <LookTile
                key={look.look_id}
                look={look}
                reducedMotion={reducedMotion}
                onSelect={handleTileClick}
                onDelete={onDelete ? handleMenuDelete : undefined}
                onSave={handleMenuSave}
                t={t}
              />
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
            <button
              type="button"
              onClick={onNext}
              disabled={readyCount === 0}
              data-testid="generate-next"
              style={{
                ...primaryBtn,
                opacity: readyCount === 0 ? 0.45 : 1,
                cursor: readyCount === 0 ? "not-allowed" : "pointer",
              }}
            >
              {t("looks.next")}
            </button>
          </div>
        </>
      )}

      {activeLook && activeLook.status === "ready" && (
        <LookDetailModal
          look={activeLook}
          lastInput={lastInput}
          onRegenerate={handleRegenerate}
          onDelete={onDelete}
          onClose={() => setActiveLookId(null)}
          busy={busy}
          capReached={capReached}
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
  margin: "2px 0 16px",
  fontSize: 13.5,
  lineHeight: 1.6,
  color: "var(--text-muted)",
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
  flexShrink: 0,
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

// 굵고 빨간 안내문구 — 생성 한도·정리 규칙을 눈에 띄게(사용자 요청 2026-06-02).
const costNote: CSSProperties = {
  margin: "12px 0 0",
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1.5,
  color: "#D92D20",
};

// 생성이 백그라운드에서 이어진다는 안내(차분한 톤).
const backgroundNote: CSSProperties = {
  margin: "8px 0 0",
  fontSize: 12,
  lineHeight: 1.5,
  color: "var(--text-muted)",
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
  gap: 14,
  marginTop: 20,
};
