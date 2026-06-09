"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  displayStyle,
  tabularStyle,
  PrimaryButton,
} from "@/components/professor/shell";

/**
 * Studio v2 — 영상 생성 진행 모달 (prototype SCREEN 4).
 *
 * 풀스크린 backdrop blur. 큰 원형 진행률 + 4단계 stages + 백그라운드 옵션 +
 * (비용 정보 제거) 진행 상황 박스.
 *
 * 비용 표시 정책 (planning/05 §1.1): prototype 의 `gen-cost` 박스는 슬라이드
 * 진행률·예상 영상 길이·월 한도(편수) 만 보여주는 진행 정보 박스로 대체.
 *
 * 본 컴포넌트는 진행률을 외부에서 props 로 제어 — 부모가 백엔드 폴링 결과를
 * 매핑한다. DEV 시뮬레이션 핸들러는 백엔드 미연결 환경에서 시각 확인용.
 */
export interface GenerationModalProps {
  open: boolean;
  /** 0~100 진행률. */
  percent: number;
  /** ETA 표시 (예: "2분 18초"). */
  eta?: string;
  /** 현재 진행 중인 stage (1~4). 그보다 낮은 stage 는 done, 같은 stage 는 active. */
  activeStage: 1 | 2 | 3 | 4;
  /** 강의 제목 (서브헤더용). */
  lectureTitle: string;
  /** 슬라이드 개수. */
  slideCount: number;
  /** 진행 정보 — 현재까지 처리된 슬라이드 수. */
  processedSlides: number;
  /** 예상 영상 길이 (예: "5분 12초"). */
  expectedDuration?: string;
  /** 월 한도 — used/limit. */
  monthlyUsed?: number;
  monthlyLimit?: number;
  /** "완료" 상태 — checkmark + confetti + 최종 통계 표시. */
  done?: boolean;
  /** 백그라운드로 실행 핸들러. */
  onBackground?: () => void;
  /** DEV 핸들러 (시뮬레이션용). */
  onDevAdd?: (delta: number) => void;
  onDevComplete?: () => void;
  onDevBackground?: () => void;
  /** 완료 후 "공유하기"(공유·게시 화면 이동) 핸들러. */
  onViewVideo?: () => void;
  /** 완료 후 "미리보기"(학생과 동일한 플레이어로 결과물 검토) 핸들러. */
  onPreview?: () => void;
  /** 완료 후 추가 액션 슬롯(예: mp4 다운로드 버튼). done 일 때만 렌더. */
  downloadSlot?: React.ReactNode;
}

const overlayStyle = (open: boolean): CSSProperties => ({
  position: "fixed",
  inset: 0,
  background: "rgba(10, 10, 10, 0.6)",
  backdropFilter: "blur(4px)",
  WebkitBackdropFilter: "blur(4px)",
  zIndex: 100,
  display: open ? "flex" : "none",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  opacity: open ? 1 : 0,
  transition: "opacity 280ms var(--ease-out)",
});

const modalStyle = (open: boolean): CSSProperties => ({
  width: "100%",
  maxWidth: 720,
  background: "var(--bg-card)",
  border: "1px solid var(--line)",
  borderRadius: 20,
  boxShadow: "0 24px 60px rgba(10, 10, 10, 0.24)",
  overflow: "hidden",
  transform: open ? "translateY(0) scale(1)" : "translateY(8px) scale(0.985)",
  opacity: open ? 1 : 0,
  transition: "transform 320ms var(--ease-out), opacity 320ms var(--ease-out)",
  maxHeight: "calc(100vh - 48px)",
  display: "flex",
  flexDirection: "column",
  position: "relative",
});

export default function GenerationModal({
  open,
  percent,
  eta,
  activeStage,
  lectureTitle,
  slideCount,
  processedSlides,
  expectedDuration,
  monthlyUsed,
  monthlyLimit,
  done = false,
  onBackground,
  onDevAdd,
  onDevComplete,
  onDevBackground,
  onViewVideo,
  onPreview,
  downloadSlot,
}: GenerationModalProps) {
  const ringFillRef = useRef<SVGCircleElement | null>(null);
  const [confettiBits, setConfettiBits] = useState<{ left: number; delay: number; bg: string }[]>([]);

  useEffect(() => {
    if (!ringFillRef.current) return;
    const C = 2 * Math.PI * 70; // circumference for r=70
    const offset = C * (1 - Math.min(100, Math.max(0, percent)) / 100);
    ringFillRef.current.style.strokeDasharray = `${C}`;
    ringFillRef.current.style.strokeDashoffset = `${offset}`;
  }, [percent]);

  useEffect(() => {
    if (!done) return;
    const palette = ["#FFB627", "#E89E0E", "#10B981", "#A78BFA", "#22D3EE"];
    // react-hooks/set-state-in-effect: effect body 안에서 동기 setState 호출
    // 금지. rAF 한 번 거쳐 비동기화한다 (다음 프레임에 confetti 가 떨어지는
    // 시각적 효과도 더 자연스러움).
    const handle = requestAnimationFrame(() => {
      setConfettiBits(
        Array.from({ length: 40 }).map(() => ({
          left: Math.random() * 100,
          delay: Math.random() * 0.6,
          bg: palette[Math.floor(Math.random() * palette.length)],
        })),
      );
    });
    return () => cancelAnimationFrame(handle);
  }, [done]);

  const stages = [
    { id: 1, title: "스크립트 검토 완료", detail: `${slideCount} / ${slideCount} 슬라이드 채택됨`, time: "0초" },
    {
      id: 2,
      title: "TTS 음성 생성 중…",
      detail: `${Math.min(processedSlides, slideCount)} / ${slideCount} 슬라이드`,
      time: eta ?? "—",
      live: `현재: 슬라이드 ${Math.min(processedSlides, slideCount)} 음성 생성`,
    },
    {
      id: 3,
      title: "자막·슬라이드 쇼 합성",
      detail: activeStage < 3 ? "대기 중" : "슬라이드·음성·자막 타임라인 합성 중",
      time: activeStage >= 3 ? eta ?? "—" : "—",
    },
    {
      id: 4,
      title: "마무리·게시 준비",
      detail: activeStage < 4 ? "대기 중" : "마무리 중",
      time: activeStage >= 4 ? eta ?? "—" : "—",
    },
  ];

  return (
    <div style={overlayStyle(open)} role="dialog" aria-modal="true" aria-labelledby="gen-h1">
      <div style={modalStyle(open)}>
        {/* DEV controls */}
        {(onDevAdd || onDevComplete || onDevBackground) && (
          <div
            aria-label="개발용 시뮬레이션 컨트롤"
            style={{
              position: "absolute",
              top: 14,
              right: 14,
              display: "inline-flex",
              gap: 6,
              padding: 4,
              border: "1px dashed var(--line-strong)",
              borderRadius: 8,
              background: "rgba(250, 250, 247, 0.9)",
              zIndex: 1,
            }}
          >
            {onDevAdd && <DevBtn onClick={() => onDevAdd(10)}>DEV: +10%</DevBtn>}
            {onDevComplete && <DevBtn onClick={onDevComplete}>DEV: 즉시 완료</DevBtn>}
            {onDevBackground && <DevBtn onClick={onDevBackground}>DEV: 백그라운드</DevBtn>}
          </div>
        )}

        {/* Confetti — done 일 때만 */}
        {done && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              overflow: "hidden",
            }}
            aria-hidden="true"
          >
            {confettiBits.map((b, i) => (
              <i
                key={i}
                style={{
                  position: "absolute",
                  top: "-10%",
                  left: `${b.left}%`,
                  width: 8,
                  height: 12,
                  background: b.bg,
                  borderRadius: 2,
                  animation: `gen-confetti-fall 3.6s ease-out ${b.delay}s forwards`,
                }}
              />
            ))}
            <style>{`
              @keyframes gen-confetti-fall {
                0% { transform: translateY(0) rotate(0deg); opacity: 1; }
                100% { transform: translateY(700px) rotate(720deg); opacity: 0; }
              }
              @media (prefers-reduced-motion: reduce) {
                @keyframes gen-confetti-fall {
                  0%, 100% { transform: translateY(0); opacity: 0; }
                }
              }
            `}</style>
          </div>
        )}

        <div style={{ overflowY: "auto", padding: "32px 36px 28px" }}>
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <h2
              id="gen-h1"
              style={{
                ...displayStyle,
                margin: 0,
                marginBottom: 6,
                fontSize: 28,
                fontWeight: 700,
                color: "var(--text)",
              }}
            >
              {done ? "슬라이드 쇼가 완성되었어요!" : "슬라이드 쇼 만드는 중…"}
            </h2>
            <div style={{ color: "var(--text-muted)", fontSize: 13.5 }}>
              {lectureTitle} · 슬라이드 {slideCount}장
            </div>
          </div>

          {/* Progress wrap */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 14,
              marginBottom: 28,
            }}
          >
            {done ? (
              <svg width="80" height="80" viewBox="0 0 80 80" aria-hidden="true">
                <defs>
                  <linearGradient id="modal-success-grad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#10B981" />
                    <stop offset="1" stopColor="#059669" />
                  </linearGradient>
                </defs>
                <circle cx="40" cy="40" r="36" fill="url(#modal-success-grad)" />
                <path
                  d="M24 41 L36 53 L57 30"
                  fill="none"
                  stroke="#FFFFFF"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <div style={{ position: "relative", width: 160, height: 160 }}>
                <svg
                  viewBox="0 0 160 160"
                  width="160"
                  height="160"
                  style={{ transform: "rotate(-90deg)" }}
                >
                  <defs>
                    <linearGradient id="modal-ring-grad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0" stopColor="#FFB627" />
                      <stop offset="1" stopColor="#E89E0E" />
                    </linearGradient>
                  </defs>
                  <circle cx="80" cy="80" r="70" fill="none" stroke="#EFEEE9" strokeWidth="10" />
                  <circle
                    ref={ringFillRef}
                    cx="80"
                    cy="80"
                    r="70"
                    fill="none"
                    stroke="url(#modal-ring-grad)"
                    strokeWidth="10"
                    strokeLinecap="round"
                    style={{ transition: "stroke-dashoffset 500ms var(--ease-out)" }}
                  />
                </svg>
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{
                      ...tabularStyle,
                      fontSize: 38,
                      fontWeight: 700,
                      letterSpacing: "-0.02em",
                      lineHeight: 1,
                      color: "var(--text)",
                    }}
                  >
                    {Math.round(percent)}%
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 10.5,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "var(--text-subtle)",
                      fontWeight: 700,
                    }}
                  >
                    진행률
                  </div>
                </div>
              </div>
            )}
            {!done && eta && (
              <div style={{ fontSize: 12.5, color: "var(--text-muted)", ...tabularStyle }}>
                예상 남은 시간 <b style={{ color: "var(--text)", fontWeight: 700 }}>{eta}</b>
              </div>
            )}
          </div>

          {/* Stages */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 0,
              marginBottom: 24,
              border: "1px solid var(--line)",
              borderRadius: 14,
              overflow: "hidden",
              background: "var(--bg)",
            }}
          >
            {stages.map((s, i) => {
              const state: "done" | "active" | "pending" =
                done || s.id < activeStage ? "done" : s.id === activeStage ? "active" : "pending";
              return (
                <div
                  key={s.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "36px 1fr auto",
                    gap: 14,
                    alignItems: "flex-start",
                    padding: "14px 18px",
                    borderBottom: i < stages.length - 1 ? "1px solid var(--line)" : "none",
                  }}
                >
                  <StageNum state={state} num={s.id} />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13.5,
                        fontWeight: 600,
                        color: state === "pending" ? "var(--text-muted)" : "var(--text)",
                        letterSpacing: "-0.005em",
                      }}
                    >
                      {s.title}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--text-subtle)", marginTop: 3 }}>
                      {s.detail}
                    </div>
                    {state === "active" && s.live && (
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--text-muted)",
                          marginTop: 6,
                          fontStyle: "italic",
                        }}
                      >
                        {s.live}
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      ...tabularStyle,
                      fontSize: 11,
                      color:
                        state === "done"
                          ? "var(--success)"
                          : state === "active"
                            ? "var(--gold)"
                            : "var(--text-subtle)",
                      fontWeight: state === "pending" ? 400 : 600,
                      marginTop: 4,
                      flexShrink: 0,
                    }}
                  >
                    {s.time}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 진행 정보 박스 (prototype `gen-cost` 의 비용 제거 대체) */}
          {!done && (
            <div
              style={{
                border: "1px solid var(--line)",
                borderRadius: 12,
                padding: "14px 18px",
                background: "var(--bg)",
                marginBottom: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <defs>
                    <linearGradient id="prog-info-grad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0" stopColor="#8B5CF6" />
                      <stop offset="1" stopColor="#6D28D9" />
                    </linearGradient>
                  </defs>
                  <rect x="4" y="4" width="16" height="16" rx="3" fill="url(#prog-info-grad)" />
                  <path
                    d="M8 15 L11 11 L14 13 L17 8"
                    stroke="#FFFFFF"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </svg>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)" }}>진행 상황</span>
              </div>
              <InfoRow
                label="슬라이드"
                value={`${processedSlides} / ${slideCount} (${Math.round((processedSlides / Math.max(slideCount, 1)) * 100)}%)`}
              />
              {expectedDuration && <InfoRow label="예상 재생 길이" value={expectedDuration} />}
              {monthlyUsed != null && monthlyLimit != null && (
                <InfoRow
                  label="사용 가능"
                  value={`Pro 플랜 · 월 ${monthlyUsed} / ${monthlyLimit}편`}
                  subtle
                />
              )}
            </div>
          )}

          {/* 백그라운드 옵션 — done 이전만 */}
          {!done && onBackground && (
            <div
              style={{
                border: "1px solid var(--line)",
                borderRadius: 12,
                padding: "16px 18px",
                marginBottom: 16,
                background: "var(--bg)",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>
                백그라운드 실행
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
                이 창을 닫아도 서버에서 계속 제작됩니다. 완성된 슬라이드 쇼는 강의 페이지에서 확인하실 수 있어요.
              </div>
              <button
                type="button"
                onClick={onBackground}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 14px",
                  border: "1px solid var(--line-strong)",
                  borderRadius: 8,
                  background: "var(--bg-card)",
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "var(--text)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                백그라운드로 실행
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
                  <path d="M5 12h14" />
                  <path d="M12 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 36px",
            borderTop: "1px solid var(--line)",
            background: "var(--bg-card)",
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: 11.5, color: "var(--text-subtle)" }}>
            진행 상황은 자동으로 저장됩니다.
          </div>
          {done && (onPreview || onViewVideo) ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {downloadSlot}
              {onPreview && (
                <PrimaryButton
                  variant="primary"
                  size="md"
                  onClick={onPreview}
                  trailingIcon={
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  }
                >
                  미리보기
                </PrimaryButton>
              )}
              {onViewVideo && (
                <PrimaryButton
                  variant="secondary"
                  size="md"
                  onClick={onViewVideo}
                  trailingIcon={
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14" />
                      <path d="M12 5l7 7-7 7" />
                    </svg>
                  }
                >
                  공유하기
                </PrimaryButton>
              )}
            </div>
          ) : (
            <span
              className="inline-flex items-center gap-1.5 rounded-full"
              style={{
                fontSize: 12,
                color: "var(--text-subtle)",
                padding: "6px 10px",
                background: "var(--bg-subtle)",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: "var(--success)",
                  boxShadow: "0 0 0 3px rgba(16, 185, 129, 0.18)",
                }}
              />
              자동 저장 중
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────── helpers ───────── */

function DevBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: 10.5,
        fontWeight: 600,
        padding: "4px 8px",
        borderRadius: 5,
        border: "1px solid var(--line)",
        background: "var(--bg-card)",
        color: "var(--text-muted)",
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {children}
    </button>
  );
}

function StageNum({ state, num }: { state: "done" | "active" | "pending"; num: number }) {
  const bg =
    state === "active"
      ? "linear-gradient(135deg, #FFB627, #E89E0E)"
      : state === "done"
        ? "linear-gradient(135deg, #10B981, #059669)"
        : "#E5E5E0";
  const color =
    state === "active" ? "#0A0A0A" : state === "done" ? "#FFFFFF" : "var(--text-subtle)";
  return (
    <span
      style={{
        width: 28,
        height: 28,
        borderRadius: "50%",
        background: bg,
        color,
        fontSize: 12,
        fontWeight: 700,
        ...tabularStyle,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        marginTop: 1,
        boxShadow: state === "active" ? "0 0 0 4px rgba(255, 182, 39, 0.18)" : "none",
        transition: "all 320ms var(--ease-out)",
      }}
    >
      {state === "done" ? (
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none">
          <path
            d="M3 8.5l3 3 7-7"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        num
      )}
    </span>
  );
}

function InfoRow({
  label,
  value,
  subtle,
}: {
  label: string;
  value: string;
  subtle?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "4px 0",
        fontSize: subtle ? 11.5 : 12,
        color: subtle ? "var(--text-subtle)" : "var(--text-muted)",
        ...tabularStyle,
      }}
    >
      <span>{label}</span>
      <span style={{ fontWeight: 700, color: "var(--text)" }}>{value}</span>
    </div>
  );
}
