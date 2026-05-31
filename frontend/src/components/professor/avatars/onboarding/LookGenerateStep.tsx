"use client";

import { useState, type CSSProperties } from "react";
import {
  LOOK_TOTAL_MAX,
  type Look,
  type LookGenerateInput,
} from "./photoAvatarTypes";
import { SparkleIcon } from "./PhotoAvatarIcons";
import LookTile from "./LookTile";
import LookOptionForm from "./LookOptionForm";

interface LookGenerateStepProps {
  looks: Look[];
  /** 구조화 옵션으로 룩 배치를 생성한다(v0.2). */
  onGenerate: (input: LookGenerateInput) => Promise<void>;
  /** 생성이 진행 중인지(generating 타일 존재). */
  looksPending: boolean;
  reducedMotion: boolean;
  /** ③ 룩 선택 단계로. ready 룩이 1개 이상일 때 활성. */
  onNext: () => void;
  /** ① 업로드로 되돌아가 다른 사진으로 다시 시작. */
  onRestart: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * ② 구조화 옵션(persona/outfit/background/expression + extra)으로 룩 배치를
 * 생성한다(v0.2 gpt-image-2). 자유 프롬프트 갤러리(v0.1)를 옵션 폼으로 대체했다.
 * 누적 상한(LOOK_TOTAL_MAX)으로 과생성을 막고(docs §0.5②), 완성된 룩이 생기면
 * "다음: 룩 선택" 으로 ③ 선택 단계로 이어진다.
 */
export default function LookGenerateStep({
  looks,
  onGenerate,
  looksPending,
  reducedMotion,
  onNext,
  onRestart,
  t,
}: LookGenerateStepProps) {
  const [submitting, setSubmitting] = useState(false);

  const total = looks.length;
  const remaining = Math.max(0, LOOK_TOTAL_MAX - total);
  const capReached = remaining <= 0;
  const readyCount = looks.filter((l) => l.status === "ready").length;
  const busy = submitting || looksPending;

  const handleGenerate = async (input: LookGenerateInput) => {
    if (busy || capReached) return;
    setSubmitting(true);
    try {
      await onGenerate(input);
    } finally {
      setSubmitting(false);
    }
  };

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

      {/* 구조화 옵션 폼 — 칩 선택 후 "룩 N장 생성" */}
      <LookOptionForm
        onGenerate={handleGenerate}
        disabled={busy}
        capReached={capReached}
        t={t}
      />

      {/* 비용 투명성 안내 (차별점 #2 / docs §8·§10) */}
      {!capReached && (
        <p style={costNote}>{t("looks.costNote", { remaining })}</p>
      )}

      {/* 진행/완료 타일 */}
      {looks.length > 0 && (
        <>
          <div style={gridStyle} data-testid="look-grid">
            {looks.map((look) => (
              <LookTile key={look.look_id} look={look} reducedMotion={reducedMotion} t={t} />
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

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
  gap: 14,
  marginTop: 20,
};
