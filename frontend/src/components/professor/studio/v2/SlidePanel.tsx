"use client";

import type { CSSProperties } from "react";
import { tabularStyle, hanStyle } from "@/components/professor/shell";

/**
 * Studio v2 — 좌측 slide-panel.
 *
 * docs/prototypes/05-studio-flow.extracted.html `.slide-panel` 구조 기반:
 * - 240px 폭, 라이트 베이지 배경, 우측 라인 분리
 * - 헤더(uppercase 작은 라벨 + 슬라이드 개수)
 * - 슬라이드 카드 목록: PPT 슬라이드 이미지 썸네일 + 우측 페이지 번호(01, 02…)
 *   발화 내용 텍스트는 표시하지 않는다(중앙 영역에서 검토). pending(AI 생성 중)
 *   은 썸네일 우상단 spinner 로만 표시.
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
   * 백엔드 ``SlideMeta.image_url`` 을 camelCase 로 매핑한 값. studio 페이지의
   * useMemo 가 ``meta.image_url`` → ``imageUrl`` 변환을 수행한 뒤 활성 슬라이드
   * 의 이 값을 ``WorkArea`` 의 ``slideImageUrl`` 로 전달한다. 렌더 전이거나
   * 컬럼 미존재 시 null/undefined — fallback mock 으로 그린다.
   */
  imageUrl?: string | null;
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
  /**
   * 업로드 직후 PPTX 분석 단계 — 카드 자리에 shimmer skeleton 5장.
   *
   * `loading` 보다 더 적극적인 상태:
   *  - 헤더 우측 "{n}장" 자리에 "분석 중" 텍스트 노출
   *  - "슬라이드 추가" 하단 버튼은 mount 하지 않음 (분석 중 추가 비허용)
   *
   * `slides.length === 0` 조건과 함께 평가하므로 슬라이드가 1장이라도
   * 도착한 뒤에는 자동으로 일반 렌더로 전환된다.
   */
  isLoading?: boolean;
}

// 슬라이드 썸네일 크기 — PPT 슬라이드 미리보기(16:9). 카드 좌측을 채우고
// 우측에 페이지 번호가 들어갈 공간을 남긴다.
const THUMB_W = 100;
const THUMB_H = 56;

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
  isLoading = false,
}: SlidePanelProps) {
  const showAnalyzing = isLoading && slides.length === 0;
  const showSkeleton = !showAnalyzing && loading && slides.length === 0;
  return (
    <aside style={panelStyle} aria-label="슬라이드 목록">
      {/* prefers-reduced-motion 시 shimmer animation 정지 + opacity 0.6 고정.
          globals.css 전역 규칙은 animation-duration 만 0.01ms 로 줄여 시각적으로
          정지처럼 보이게 하지만, 명시적 opacity 락이 필요해 별도 inline 규칙. */}
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .slidepanel-analyzing-shimmer .studio-skeleton-block {
            animation: none !important;
            background-image: none !important;
            opacity: 0.6;
          }
        }
      `}</style>
      <div style={headStyle}>
        <h3 style={headLabelStyle}>슬라이드</h3>
        <span
          style={{
            ...tabularStyle,
            fontSize: 11,
            color: "var(--text-faint)",
          }}
        >
          {showAnalyzing ? "분석 중" : showSkeleton ? "—" : `${slides.length}장`}
        </span>
      </div>
      {showAnalyzing ? (
        <ul
          style={listStyle}
          aria-busy="true"
          aria-label="슬라이드 분석 중"
          data-testid="slidepanel-analyzing"
        >
          {[0, 1, 2, 3, 4].map((i) => (
            <li key={i}>
              <AnalyzingSkeletonCard />
            </li>
          ))}
        </ul>
      ) : showSkeleton ? (
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
          const num = String(s.index + 1).padStart(2, "0");
          return (
            <li key={s.index}>
              <button
                type="button"
                onClick={() => onSelect(s.index)}
                aria-current={active ? "true" : undefined}
                aria-label={`슬라이드 ${num}${s.status === "pending" ? " · AI 생성 중" : ""}`}
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
                {/* Thumb — PPT 슬라이드 이미지 (없으면 한자/빈 박스). */}
                <span
                  className="flex-shrink-0"
                  aria-hidden="true"
                  style={{
                    position: "relative",
                    width: THUMB_W,
                    height: THUMB_H,
                    borderRadius: 5,
                    background: "var(--bg)",
                    border: "1px solid var(--line)",
                    overflow: "hidden",
                  }}
                >
                  {s.imageUrl ? (
                    // 슬라이드 PNG — next/image 대신 단순 <img> 로 S3 외부 도메인
                    // 등록을 회피(WorkArea 의 미리보기 이미지와 동일 정책).
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.imageUrl}
                      alt=""
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                      }}
                    />
                  ) : s.thumbChar ? (
                    <span
                      style={{
                        ...hanStyle,
                        position: "absolute",
                        inset: 0,
                        display: "grid",
                        placeItems: "center",
                        fontSize: 18,
                        fontWeight: 700,
                        color: active ? "var(--gold)" : "var(--text-faint)",
                      }}
                    >
                      {s.thumbChar}
                    </span>
                  ) : null}
                  {/* AI 생성 중 — 썸네일 우상단 spinner. */}
                  {s.status === "pending" && (
                    <span
                      style={{
                        position: "absolute",
                        top: 3,
                        right: 3,
                        display: "inline-grid",
                        placeItems: "center",
                        width: 17,
                        height: 17,
                        borderRadius: 999,
                        background: "rgba(250, 250, 247, 0.92)",
                      }}
                    >
                      <svg
                        viewBox="0 0 16 16"
                        width="12"
                        height="12"
                        className="studio-slide-spinner"
                        aria-hidden="true"
                      >
                        <circle cx="8" cy="8" r="5.5" fill="none" stroke="rgba(255, 182, 39, 0.20)" strokeWidth="1.6" />
                        <path d="M 8 2.5 A 5.5 5.5 0 0 1 13.5 8" fill="none" stroke="var(--gold-on-light, var(--gold))" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    </span>
                  )}
                </span>
                {/* spacer */}
                <span style={{ flex: 1 }} aria-hidden="true" />
                {/* 페이지 번호 — 우측 표기 */}
                <span
                  className="flex-shrink-0"
                  style={{
                    ...tabularStyle,
                    fontSize: 13,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    color: active ? "var(--gold)" : "var(--text-muted)",
                  }}
                >
                  {num}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      )}
      {!showAnalyzing && (
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
      )}
    </aside>
  );
}

/**
 * PPTX 분석 중 표시되는 shimmer 카드 — 5장 모킹용.
 *
 * `studio-skeleton-block` 클래스(globals.css) 가 `--ease-out` 토큰 기반의
 * shimmer 그라데이션을 입혀준다. 추가로 `slidepanel-analyzing-shimmer`
 * 클래스를 부여해 prefers-reduced-motion 환경에서 위쪽 inline `<style>`
 * 블록이 animation 을 멈추고 opacity 0.6 으로 고정한다.
 */
function AnalyzingSkeletonCard() {
  return (
    <div
      className="slidepanel-analyzing-shimmer"
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
          width: THUMB_W,
          height: THUMB_H,
          borderRadius: 5,
          flexShrink: 0,
        }}
      />
      <span style={{ flex: 1 }} />
      <span
        className="studio-skeleton-block"
        style={{ width: 18, height: 11, borderRadius: 3, flexShrink: 0 }}
      />
    </div>
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
          width: THUMB_W,
          height: THUMB_H,
          borderRadius: 5,
          flexShrink: 0,
        }}
      />
      <span style={{ flex: 1 }} />
      <span
        className="studio-skeleton-block"
        style={{ width: 18, height: 11, borderRadius: 3, flexShrink: 0 }}
      />
    </div>
  );
}
