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
  /** 룩 1개를 라이브러리에서 삭제(LookDetailModal 내부 버튼). */
  onDelete?: (lookId: string) => Promise<void>;
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

  // 타일 클릭: ready 는 상세 모달, 그 외(주로 generating 정체)는 정리(삭제)한다.
  // 워커 장애 등으로 generating 룩이 누적 cap 을 점유해 생성 폼이 사라지면,
  // 사용자가 멈춘 룩을 눌러 직접 비워 빠져나올 수 있게 한다(백엔드 reaper 와 별개의
  // 즉시 회복 경로).
  const handleTileClick = (id: string) => {
    const look = visibleLooks.find((l) => l.look_id === id);
    if (!look) return;
    if (look.status === "ready") {
      setActiveLookId(id);
      return;
    }
    if (!onDelete) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(t("looks.removePendingConfirm"))
    ) {
      return;
    }
    void onDelete(id);
  };

  // 정체/실패로 cap 을 채웠는데 ready 가 없으면(완전 정지) 회복 안내를 띄운다.
  const stuckOnly = capReached && readyCount === 0;

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

      {/* 안내 — 라이브러리 상한 (i18n looks.costNote 가 텍스트를 결정) */}
      {!capReached && (
        <p style={costNote}>{t("looks.costNote", { remaining })}</p>
      )}

      {/* 완전 정지(cap 도달 + ready 0) 회복 안내 — 멈춘 룩을 눌러 정리하도록 유도 */}
      {stuckOnly && onDelete && (
        <p style={stuckHint} data-testid="stuck-hint">
          {t("looks.capReachedHint")}
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
                allowOpenAnyStatus={!!onDelete}
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
          onRegenerate={handleGenerate}
          onDelete={onDelete}
          onClose={() => setActiveLookId(null)}
          busy={busy}
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

const costNote: CSSProperties = {
  margin: "12px 0 0",
  fontSize: 11.5,
  lineHeight: 1.5,
  color: "var(--text-faint)",
};

const stuckHint: CSSProperties = {
  margin: "12px 0 0",
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
