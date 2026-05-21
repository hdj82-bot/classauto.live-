"use client";

import type { CSSProperties, ReactNode } from "react";
import { tabularStyle, hanStyle, displayStyle } from "@/components/professor/shell";

/**
 * Studio v2 — 중앙 work area.
 *
 * docs/prototypes/05-studio-flow.extracted.html `.work` + `.preview-card`
 * + `.script-card` 구조 그대로.
 *
 * - preview-card: 슬라이드 미리보기 (격자 배경 + slide-mock)
 * - script-card: 원본 PPT 노트 + AI 다듬은 스크립트 (2-block) + actions
 *
 * 본 컴포넌트는 시각만 책임지고 데이터는 props 로 받는다.
 */

export interface WorkAreaProps {
  /** 현재 슬라이드 정보 — 미리보기 헤더용. */
  slideNumber: number;
  totalSlides: number;
  slideTitle: string;
  /** 슬라이드 mock 콘텐츠 (badge + h1 + sub + 칼럼 카드 등). 없으면 placeholder. */
  slideMock?: ReactNode;
  /** 원본 PPT 노트 텍스트. */
  originalText: string;
  /** AI 다듬은 스크립트 텍스트. */
  aiText: string;
  /** 예상 길이·글자수 등 메타. */
  meta?: string;
  /**
   * 활성 슬라이드가 백엔드에서 "pending" (스크립트 생성 전) 인지 여부.
   * true 면 originalText·aiText 자리를 skeleton 으로 갈음하고 "AI 생성 중…"
   * 인디케이터를 노출. 슬라이드 카드 (좌측) 는 SlidePanel 이 spinner 로 표시.
   *
   * 종전에는 scriptLoading 단일 플래그로 페이지 전체 텍스트를 안내 문구로
   * 치환했지만, 이번 PR 부터는 슬라이드 단위로 ready/pending 이 갈리므로 더
   * 정확한 신호가 필요하다.
   */
  activeSlidePending?: boolean;
  /** 채택 / 거부 핸들러. */
  onAccept?: () => void;
  onReject?: () => void;
  onEdit?: () => void;
  onRegenerate?: () => void;
  onListen?: () => void;
}

const workStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  background: "var(--bg)",
  overflow: "hidden",
};

const workScrollStyle: CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "20px 28px 24px",
};

const cardOuterStyle: CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--line)",
  borderRadius: 14,
  overflow: "hidden",
  boxShadow: "var(--shadow-sm)",
};

const previewHeadStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 16px",
  borderBottom: "1px solid var(--line)",
};

const previewBodyStyle: CSSProperties = {
  height: "clamp(220px, 38vh, 360px)",
  flexShrink: 0,
  background: "linear-gradient(180deg, #FFFFFF 0%, #FAFAF7 100%)",
  display: "grid",
  placeItems: "center",
  position: "relative",
  overflow: "hidden",
};

const previewGridOverlay: CSSProperties = {
  content: '""',
  position: "absolute",
  inset: 0,
  backgroundImage:
    "linear-gradient(rgba(10,10,10,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(10,10,10,0.025) 1px, transparent 1px)",
  backgroundSize: "32px 32px",
};

const slideMockStyle: CSSProperties = {
  position: "relative",
  width: "88%",
  height: "86%",
  background: "var(--bg-card)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  padding: "18px 22px",
  boxShadow: "var(--shadow-sm)",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  overflow: "hidden",
};

const scriptCardStyle: CSSProperties = {
  ...cardOuterStyle,
  marginTop: 16,
};

const blockStyle: CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: 10,
  background: "var(--bg-card)",
  overflow: "hidden",
};

const blockHeadBase: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 12px",
  background: "var(--bg)",
  borderBottom: "1px solid var(--line)",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

const blockTextStyle: CSSProperties = {
  padding: "12px 14px",
  fontSize: 13.5,
  lineHeight: 1.65,
  whiteSpace: "pre-wrap",
};

const pillBtnStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "7px 12px",
  borderRadius: 8,
  border: "1px solid var(--line-strong)",
  background: "var(--bg-card)",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
  color: "var(--text)",
  transition: "all 140ms var(--ease-out)",
  fontFamily: "inherit",
};

export default function WorkArea({
  slideNumber,
  totalSlides,
  slideTitle,
  slideMock,
  originalText,
  aiText,
  meta,
  activeSlidePending = false,
  onAccept,
  onReject,
  onEdit,
  onRegenerate,
  onListen,
}: WorkAreaProps) {
  return (
    <div style={workStyle}>
      <div style={workScrollStyle}>
        {/* PREVIEW CARD */}
        <div style={cardOuterStyle}>
          <div style={previewHeadStyle}>
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  color: "var(--gold)",
                  textTransform: "uppercase",
                }}
              >
                슬라이드 <span style={tabularStyle}>{slideNumber}</span> / {totalSlides}
              </span>
              <span
                className="truncate"
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--text)",
                  maxWidth: "40vw",
                }}
              >
                {slideTitle}
              </span>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={onListen} style={pillBtnStyle}>
                <svg
                  viewBox="0 0 24 24"
                  width="11"
                  height="11"
                  fill="var(--gold)"
                >
                  <path d="M7 4.5v15a1 1 0 0 0 1.55.83l11-7.5a1 1 0 0 0 0-1.66l-11-7.5A1 1 0 0 0 7 4.5z" />
                </svg>
                미리듣기
              </button>
            </div>
          </div>
          <div style={previewBodyStyle}>
            <div style={previewGridOverlay} aria-hidden="true" />
            <div style={slideMockStyle}>
              {slideMock ?? (
                <DefaultSlideMock title={slideTitle} number={slideNumber} />
              )}
            </div>
            {activeSlidePending && (
              <PendingPreviewOverlay slideNumber={slideNumber} />
            )}
          </div>
        </div>

        {/* SCRIPT CARD */}
        <div style={scriptCardStyle}>
          <div
            style={{
              padding: "14px 18px",
              borderBottom: "1px solid var(--line)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <h3
              style={{
                ...displayStyle,
                margin: 0,
                fontSize: 16,
                fontWeight: 700,
              }}
            >
              스크립트 검토
            </h3>
            {meta && (
              <span
                style={{
                  ...tabularStyle,
                  fontSize: 11,
                  color: "var(--text-subtle)",
                }}
              >
                {meta}
              </span>
            )}
          </div>
          <div style={{ padding: "16px 18px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={blockStyle}>
              <div
                style={{
                  ...blockHeadBase,
                  color: "var(--text-muted)",
                }}
              >
                원본 PPT 노트
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: 10,
                    letterSpacing: "0.04em",
                    textTransform: "none",
                    fontWeight: 500,
                    color: "var(--text-faint)",
                  }}
                >
                  발표자 노트에서 추출
                </span>
              </div>
              <div style={{ ...blockTextStyle, color: "var(--text-muted)" }}>
                {originalText}
              </div>
            </div>
            <div style={blockStyle}>
              <div
                style={{
                  ...blockHeadBase,
                  color: "var(--gold)",
                  background: "rgba(255, 182, 39, 0.06)",
                }}
              >
                AI 다듬은 스크립트
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: 10,
                    letterSpacing: "0.04em",
                    textTransform: "none",
                    fontWeight: 500,
                    color: "var(--text-faint)",
                  }}
                >
                  하두진 교수 톤 학습 모델
                </span>
              </div>
              <div style={{ ...blockTextStyle, color: "var(--text)" }}>
                {aiText}
              </div>
            </div>
            <div className="flex flex-wrap gap-2" style={{ marginTop: 4 }}>
              <button
                type="button"
                onClick={onAccept}
                style={{
                  ...pillBtnStyle,
                  background: "rgba(16, 185, 129, 0.10)",
                  borderColor: "rgba(16, 185, 129, 0.30)",
                  color: "#047857",
                }}
              >
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                채택
              </button>
              <button
                type="button"
                onClick={onReject}
                style={{
                  ...pillBtnStyle,
                  background: "rgba(239, 68, 68, 0.06)",
                  borderColor: "rgba(239, 68, 68, 0.24)",
                  color: "#B91C1C",
                }}
              >
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
                거부
              </button>
              <button type="button" onClick={onEdit} style={pillBtnStyle}>
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                수동 편집
              </button>
              <span style={{ flex: 1 }} />
              <button
                type="button"
                onClick={onRegenerate}
                style={{ ...pillBtnStyle, color: "var(--text-muted)" }}
              >
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15A9 9 0 1 0 6 5.3L1 10" />
                </svg>
                다시 생성
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 활성 슬라이드가 pending 상태일 때 preview body 위에 띄우는 반투명 오버레이.
 * AI 스크립트 생성 중임을 알리는 spinner + 라벨로 구성. 슬라이드 미리보기
 * 자체(slideMock) 는 그대로 보이되 위에 layer 가 깔린다 — 어떤 슬라이드인지
 * 식별은 가능하면서도 "아직 작업 중" 임이 분명히 전달된다.
 */
function PendingPreviewOverlay({ slideNumber }: { slideNumber: number }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        placeItems: "center",
        background: "rgba(250, 250, 247, 0.78)",
        backdropFilter: "blur(2px)",
        zIndex: 2,
        gap: 8,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
        <svg
          viewBox="0 0 32 32"
          width="28"
          height="28"
          className="studio-slide-spinner"
          aria-hidden="true"
        >
          <circle
            cx="16"
            cy="16"
            r="12"
            fill="none"
            stroke="rgba(255, 182, 39, 0.20)"
            strokeWidth="3"
          />
          <path
            d="M 16 4 A 12 12 0 0 1 28 16"
            fill="none"
            stroke="var(--gold-on-light, var(--gold))"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
        <div
          style={{
            ...tabularStyle,
            fontSize: 12,
            fontWeight: 600,
            color: "var(--gold-on-light, var(--gold))",
            letterSpacing: "0.04em",
          }}
        >
          슬라이드 {slideNumber} · AI 생성 중…
        </div>
      </div>
    </div>
  );
}

/**
 * slideTitle 에 한자가 포함되어 있으면 그 한자 1자를 큰 글자로 보여주는 fallback
 * mock. prototype 의 把자문 슬라이드 디자인을 일반화.
 */
function DefaultSlideMock({ title, number }: { title: string; number: number }) {
  const hanMatch = title.match(/[㐀-䶿一-鿿]/);
  const hanChar = hanMatch?.[0];

  return (
    <>
      <span
        style={{
          display: "inline-flex",
          alignSelf: "flex-start",
          padding: "2px 9px",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.10em",
          color: "var(--gold)",
          background: "var(--gold-soft)",
          borderRadius: 999,
          textTransform: "uppercase",
        }}
      >
        Slide {number}
      </span>
      <h1
        style={{
          ...displayStyle,
          margin: 0,
          fontSize: "clamp(18px, 2vw, 22px)",
          fontWeight: 700,
          letterSpacing: "-0.015em",
          lineHeight: 1.25,
          color: "var(--text)",
        }}
      >
        {hanChar ? <span style={hanStyle}>{hanChar}</span> : null}
        {title.replace(/[㐀-䶿一-鿿]/, "")}
      </h1>
      <p
        style={{
          margin: 0,
          color: "var(--text-muted)",
          fontSize: 13,
          lineHeight: 1.55,
        }}
      >
        AI 가 분석한 슬라이드 미리보기입니다. 실제 PPT 디자인은 영상 생성 후
        확인하실 수 있어요.
      </p>
    </>
  );
}
