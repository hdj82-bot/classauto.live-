"use client";

import type { CSSProperties } from "react";
import { tabularStyle, PrimaryButton } from "@/components/professor/shell";

/**
 * Studio v2 — 하단 action-bar.
 *
 * docs/prototypes/05-studio-flow.extracted.html `.action-bar`.
 * 60px 고정 높이, 3 슬롯: prev / center 진행 / next + primary CTA.
 */
export interface ActionBarProps {
  current: number; // 1-based
  total: number;
  acceptedCount: number;
  canPrev: boolean;
  onPrev: () => void;
  onGenerate: () => void;
  generating?: boolean;
  /** 기본 "슬라이드 쇼 제작". 필요 시 호출부에서 교체. */
  ctaLabel?: string;
}

const barStyle: CSSProperties = {
  flexShrink: 0,
  height: 60,
  background: "var(--bg-card)",
  borderTop: "1px solid var(--line)",
  display: "grid",
  gridTemplateColumns: "1fr auto 1fr",
  alignItems: "center",
  padding: "0 24px",
  gap: 16,
};

const ghostBtnStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "9px 16px",
  borderRadius: 10,
  border: "1px solid var(--line-strong)",
  background: "var(--bg-card)",
  fontSize: 13.5,
  fontWeight: 600,
  cursor: "pointer",
  color: "var(--text)",
  fontFamily: "inherit",
  transition: "all 140ms var(--ease-out)",
};

export default function ActionBar({
  current,
  total,
  acceptedCount,
  canPrev,
  onPrev,
  onGenerate,
  generating = false,
  ctaLabel,
}: ActionBarProps) {
  return (
    <div style={barStyle}>
      <div className="justify-self-start">
        <button
          type="button"
          onClick={onPrev}
          disabled={!canPrev}
          style={{
            ...ghostBtnStyle,
            opacity: canPrev ? 1 : 0.45,
            cursor: canPrev ? "pointer" : "not-allowed",
          }}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
          이전 슬라이드
        </button>
      </div>
      <div
        className="hidden sm:block"
        style={{
          fontSize: 12,
          color: "var(--text-muted)",
          ...tabularStyle,
        }}
      >
        슬라이드 <b style={{ color: "var(--text)", fontWeight: 700 }}>{current}</b> / {total} ·{" "}
        <b style={{ color: "var(--text)", fontWeight: 700 }}>{acceptedCount}</b>개 채택
      </div>
      <div className="justify-self-end flex gap-2">
        <PrimaryButton
          type="button"
          variant="primary"
          size="md"
          disabled={generating}
          onClick={onGenerate}
          trailingIcon={
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          }
        >
          {generating ? "제작 중…" : (ctaLabel ?? "슬라이드 쇼 제작")}
        </PrimaryButton>
      </div>
    </div>
  );
}
