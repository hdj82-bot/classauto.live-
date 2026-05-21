"use client";

import type { CSSProperties } from "react";
import { tabularStyle, hanStyle } from "@/components/professor/shell";

/**
 * Studio v2 — 좌측 slide-panel.
 *
 * docs/prototypes/05-studio-flow.extracted.html `.slide-panel` 구조 그대로:
 * - 240px 폭, 라이트 베이지 배경, 우측 라인 분리
 * - 헤더(uppercase 작은 라벨 + 슬라이드 개수)
 * - 슬라이드 카드 목록: 56×36 썸네일 + 번호·이름 · 상태 dot
 * - 하단 "슬라이드 추가" dashed 버튼 (placeholder)
 *
 * 1280px 이하 viewport 에서는 drawer 로 전환 — 현재는 데스크톱 기준만 구현.
 */
export interface StudioSlide {
  index: number;
  title: string;
  /** 썸네일에 표시할 핵심 글자 (한자 1자 권장). */
  thumbChar?: string;
  /**
   * - "adopted" / "warn" / "empty": 교수자 검토 액션 결과 (기존)
   * - "pending":                    AI 스크립트가 아직 도착하지 않은 슬라이드.
   *                                  카드는 즉시 보여주되 status dot 는 spinner 로.
   */
  status: "adopted" | "warn" | "empty" | "pending";
}

interface SlidePanelProps {
  slides: StudioSlide[];
  activeIndex: number;
  onSelect: (index: number) => void;
  /**
   * 초기 슬라이드 메타가 아직 도착하지 않았을 때 — 카드 자리에 skeleton 3장.
   * 종전: scriptLoading 동안 SlidePanel 이 0장만 표시 → 페이지가 비어 보였음.
   * /api/lectures/{id}/slides 폴링이 빈 응답 (PPTX 파싱 직전) 일 때 사용.
   */
  loading?: boolean;
}

const panelStyle: CSSProperties = {
  width: 240,
  flexShrink: 0,
  background: "var(--bg-sidebar)",
  borderRight: "1px solid var(--line)",
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
};

const headStyle: CSSProperties = {
  padding: "14px 16px 10px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const headLabelStyle: CSSProperties = {
  margin: 0,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  color: "var(--text-faint)",
};

const listStyle: CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "4px 12px 12px",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  margin: 0,
  listStyle: "none",
};

const addBtnStyle: CSSProperties = {
  margin: "6px 12px 14px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: 9,
  background: "transparent",
  border: "1px dashed var(--line-strong)",
  borderRadius: 10,
  color: "var(--text-muted)",
  fontSize: 12.5,
  fontWeight: 500,
  cursor: "pointer",
  transition: "all 140ms var(--ease-out)",
};

export default function SlidePanel({
  slides,
  activeIndex,
  onSelect,
  loading = false,
}: SlidePanelProps) {
  const showSkeleton = loading && slides.length === 0;
  return (
    <aside style={panelStyle} aria-label="슬라이드 목록">
      <div style={headStyle}>
        <h3 style={headLabelStyle}>슬라이드</h3>
        <span
          style={{
            ...tabularStyle,
            fontSize: 11,
            color: "var(--text-faint)",
          }}
        >
          {showSkeleton ? "—" : `${slides.length}장`}
        </span>
      </div>
      {showSkeleton ? (
        <ul style={listStyle} aria-busy="true" aria-label="슬라이드 메타 로딩 중">
          {[0, 1, 2].map((i) => (
            <li key={i}>
              <SkeletonCard />
            </li>
          ))}
        </ul>
      ) : (
      <ul style={listStyle}>
        {slides.map((s) => {
          const active = s.index === activeIndex;
          return (
            <li key={s.index}>
              <button
                type="button"
                onClick={() => onSelect(s.index)}
                aria-current={active ? "true" : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: 8,
                  background: "var(--bg-card)",
                  border: `1px solid ${active ? "var(--gold-bright)" : "var(--line)"}`,
                  borderRadius: 10,
                  boxShadow: active
                    ? "0 0 0 3px rgba(255, 182, 39, 0.18)"
                    : "none",
                  cursor: "pointer",
                  transition: "border-color 140ms var(--ease-out), box-shadow 140ms var(--ease-out)",
                  textAlign: "left",
                  fontFamily: "inherit",
                }}
              >
                {/* Thumb */}
                <span
                  className="inline-grid place-items-center flex-shrink-0"
                  aria-hidden="true"
                  style={{
                    width: 56,
                    height: 36,
                    borderRadius: 5,
                    background: "var(--bg)",
                    border: "1px solid var(--line)",
                    overflow: "hidden",
                  }}
                >
                  {s.thumbChar && (
                    <span
                      style={{
                        ...hanStyle,
                        fontSize: 14,
                        fontWeight: 700,
                        color: active ? "var(--gold)" : "var(--text-faint)",
                      }}
                    >
                      {s.thumbChar}
                    </span>
                  )}
                </span>
                {/* Body */}
                <span className="flex-1 min-w-0">
                  <span
                    className="block"
                    style={{
                      ...tabularStyle,
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      color: active ? "var(--gold)" : "var(--text-faint)",
                    }}
                  >
                    {String(s.index + 1).padStart(2, "0")}
                  </span>
                  <span
                    className="block truncate"
                    style={{
                      marginTop: 1,
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: "var(--text)",
                    }}
                  >
                    {s.title}
                  </span>
                </span>
                {/* Status */}
                <span
                  className="flex-shrink-0"
                  aria-hidden={s.status === "pending" ? undefined : "true"}
                  aria-label={
                    s.status === "pending"
                      ? "AI 스크립트 생성 중"
                      : undefined
                  }
                >
                  <StatusDot status={s.status} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      )}
      <button type="button" style={addBtnStyle}>
        <svg
          viewBox="0 0 24 24"
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        슬라이드 추가
      </button>
    </aside>
  );
}

function SkeletonCard() {
  // 슬라이드 메타가 도착하기 전 placeholder. 시각만 — onClick 없음.
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: 8,
        background: "var(--bg-card)",
        border: "1px solid var(--line)",
        borderRadius: 10,
      }}
      aria-hidden="true"
    >
      <span
        className="studio-skeleton-block"
        style={{
          width: 56,
          height: 36,
          borderRadius: 5,
          flexShrink: 0,
        }}
      />
      <span style={{ flex: 1, minWidth: 0, display: "block" }}>
        <span
          className="studio-skeleton-block"
          style={{
            display: "block",
            width: "30%",
            height: 8,
            borderRadius: 3,
          }}
        />
        <span
          className="studio-skeleton-block"
          style={{
            display: "block",
            marginTop: 6,
            width: "80%",
            height: 10,
            borderRadius: 3,
          }}
        />
      </span>
    </div>
  );
}

function StatusDot({ status }: { status: StudioSlide["status"] }) {
  if (status === "pending") {
    // AI 스크립트 생성 중 — 회전 spinner. prefers-reduced-motion 환경에선
    // CSS 가 animation 을 무효화하므로 정적 호 모양만 남는다.
    return (
      <svg
        viewBox="0 0 16 16"
        width="14"
        height="14"
        className="studio-slide-spinner"
      >
        <circle
          cx="8"
          cy="8"
          r="5.5"
          fill="none"
          stroke="rgba(255, 182, 39, 0.20)"
          strokeWidth="1.6"
        />
        <path
          d="M 8 2.5 A 5.5 5.5 0 0 1 13.5 8"
          fill="none"
          stroke="var(--gold-on-light, var(--gold))"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (status === "adopted") {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" aria-label="채택됨">
        <circle cx="8" cy="8" r="6" fill="url(#nav-grad-electric)" />
        <path
          d="M5 8.5l2.2 2.2 3.8-4"
          stroke="#FFFFFF"
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (status === "warn") {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" aria-label="확인 필요">
        <path
          d="M8 2l6 11H2L8 2z"
          fill="rgba(176, 171, 158, 0.40)"
          stroke="#B0AB9E"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <rect x="7.4" y="6" width="1.2" height="4" rx="0.6" fill="#B0AB9E" />
        <circle cx="8" cy="11.4" r="0.7" fill="#B0AB9E" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-label="대기">
      <circle cx="8" cy="8" r="5" fill="none" stroke="#C5C2B6" strokeWidth="1.4" />
    </svg>
  );
}
