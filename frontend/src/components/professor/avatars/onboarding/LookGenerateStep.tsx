"use client";

import { useState, type CSSProperties } from "react";
import {
  LOOK_BATCH_MAX,
  LOOK_TOTAL_MAX,
  type Look,
} from "./photoAvatarTypes";
import { SparkleIcon } from "./PhotoAvatarIcons";
import LookTile from "./LookTile";

interface LookGenerateStepProps {
  looks: Look[];
  /** 룩 배치 생성(prompt, count). 진행 타일이 즉시 추가된다. */
  onGenerate: (prompt: string, count: number) => Promise<void>;
  /** 생성이 진행 중인지(generating 타일 존재). */
  looksPending: boolean;
  reducedMotion: boolean;
  /** ④ 룩 선택 단계로. ready 룩이 1개 이상일 때 활성. */
  onNext: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * ③ 프롬프트 입력 + Design with AI 룩 배치 생성.
 *
 * 한 번에 최대 4개(LOOK_BATCH_MAX, 계약 count≤4) 생성하고, 누적 상한
 * (LOOK_TOTAL_MAX) 으로 과생성을 막는다(docs §8 비용 가드레일). "추가 생성"은
 * 항상 명시 버튼으로만 — 자동 재생성 없음.
 */
export default function LookGenerateStep({
  looks,
  onGenerate,
  looksPending,
  reducedMotion,
  onNext,
  t,
}: LookGenerateStepProps) {
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState<number>(LOOK_BATCH_MAX);
  const [submitting, setSubmitting] = useState(false);

  const presets = [
    t("looks.preset1"),
    t("looks.preset2"),
    t("looks.preset3"),
    t("looks.preset4"),
  ];

  const total = looks.length;
  const remaining = Math.max(0, LOOK_TOTAL_MAX - total);
  const capReached = remaining <= 0;
  const effectiveMax = Math.min(LOOK_BATCH_MAX, remaining || LOOK_BATCH_MAX);
  const readyCount = looks.filter((l) => l.status === "ready").length;
  const trimmed = prompt.trim();

  const canGenerate =
    !!trimmed && !submitting && !looksPending && !capReached;

  const submit = async () => {
    if (!canGenerate) return;
    const n = Math.min(count, effectiveMax);
    setSubmitting(true);
    try {
      await onGenerate(trimmed, n);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div data-testid="step-generate" style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <SparkleIcon size={26} />
        <h2 style={headingStyle}>{t("looks.title")}</h2>
      </div>
      <p style={descStyle}>{t("looks.description")}</p>

      {/* 프롬프트 입력 */}
      <label htmlFor="look-prompt" style={labelStyle}>
        {t("looks.promptLabel")}
      </label>
      <textarea
        id="look-prompt"
        data-testid="look-prompt"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={t("looks.promptPlaceholder")}
        rows={3}
        style={textareaStyle}
      />

      {/* 프리셋 칩 */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPrompt(p)}
            style={chipStyle}
            data-testid="look-preset"
          >
            {p}
          </button>
        ))}
      </div>

      {/* 개수 + 생성 버튼 */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 14,
          marginTop: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
            {t("looks.countLabel")}
          </span>
          <div style={{ display: "inline-flex", gap: 4 }} role="group" aria-label={t("looks.countLabel")}>
            {Array.from({ length: LOOK_BATCH_MAX }, (_, i) => i + 1).map((n) => {
              const disabled = n > effectiveMax;
              const active = count === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCount(n)}
                  disabled={disabled}
                  aria-pressed={active}
                  data-testid={`look-count-${n}`}
                  style={{
                    ...countBtn,
                    background: active ? "var(--gold)" : "var(--bg-card)",
                    color: active ? "#0A0A0A" : "var(--text)",
                    borderColor: active ? "var(--gold)" : "var(--line-strong)",
                    opacity: disabled ? 0.35 : 1,
                    cursor: disabled ? "not-allowed" : "pointer",
                  }}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={!canGenerate}
          data-testid="look-generate"
          style={{
            ...primaryBtn,
            opacity: canGenerate ? 1 : 0.45,
            cursor: canGenerate ? "pointer" : "not-allowed",
          }}
        >
          {submitting || looksPending
            ? t("looks.generating")
            : total > 0
              ? t("looks.generateMore")
              : t("looks.generate")}
        </button>
      </div>

      {/* 비용 투명성 안내 (차별점 #2 / docs §8·§10) */}
      <p style={costNote}>
        {capReached
          ? t("looks.capReached", { max: LOOK_TOTAL_MAX })
          : t("looks.costNote", { remaining })}
      </p>

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

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 12.5,
  fontWeight: 600,
  color: "var(--text)",
  marginBottom: 6,
};

const textareaStyle: CSSProperties = {
  width: "100%",
  resize: "vertical",
  borderRadius: 12,
  border: "1px solid var(--line-strong)",
  background: "var(--bg)",
  padding: "10px 12px",
  fontSize: 13.5,
  lineHeight: 1.55,
  color: "var(--text)",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const chipStyle: CSSProperties = {
  padding: "6px 12px",
  fontSize: 12,
  fontWeight: 500,
  borderRadius: 999,
  border: "1px solid var(--line-strong)",
  background: "var(--bg-subtle)",
  color: "var(--text-muted)",
  cursor: "pointer",
  fontFamily: "inherit",
};

const countBtn: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 9,
  border: "1px solid",
  fontSize: 13,
  fontWeight: 700,
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
