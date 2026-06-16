"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import {
  displayStyle,
  tabularStyle,
  PrimaryButton,
} from "@/components/professor/shell";

/**
 * Studio v2 — 영상 생성 진행 모달.
 *
 * 진행 표현은 **단계별 가로 바**다(원형 1개 % 폐기). 각 작업이 독립 바로 좌→우
 * 채워지고, 바마다 진행 %(또는 '제작 중')를 숫자로 보여준다. 추천 질문(Q&A)은
 * HeyGen 영상 1개당 1개 바로 **독립** 표시한다(예: 슬라이드 1 + 음성 1 + 추천 질문 3
 * = 바 5개). 슬라이드 음성과 추천 질문은 백엔드에서 병렬로 진행된다.
 *
 * 본 컴포넌트는 진행 상태를 외부 props 로 제어한다(부모가 백엔드 폴링 결과 매핑).
 */
export type SeedRenderStatus =
  | "pending"
  | "rendering"
  | "ready"
  | "failed"
  | string;

export interface GenerationModalProps {
  open: boolean;
  /** ETA 표시 (예: "2분 18초"). 선택. */
  eta?: string;
  /** 강의 제목 (서브헤더용). */
  lectureTitle: string;
  /** 슬라이드 개수. */
  slideCount: number;
  /** 음성(TTS) 완료된 슬라이드 수. */
  processedSlides: number;
  /**
   * 추천 질문(Q&A) 답변 아바타 — 등록된 질문 1개당 1개 바로 독립 표시.
   * 각 항목의 status 로 바 상태를 결정한다(pending=대기·rendering=제작중·
   * ready=완료·failed=실패). 비어 있으면 Q&A 바를 그리지 않는다.
   */
  qaItems?: { status?: SeedRenderStatus | null }[];
  /** "완료" 상태 — 모든 바 완료 + 미리보기/공유 버튼. */
  done?: boolean;
  /** 백그라운드로 실행 핸들러. */
  onBackground?: () => void;
  /** 진행이 오래 멈춘 것으로 보일 때 true. */
  stalled?: boolean;
  /** 멈춤 시 재시도(rerender) 핸들러. */
  onRetry?: () => void;
  /** DEV 핸들러 (시뮬레이션용). */
  onDevAdd?: (delta: number) => void;
  onDevComplete?: () => void;
  onDevBackground?: () => void;
  /** 완료 후 "공유하기" 핸들러. */
  onViewVideo?: () => void;
  /** 완료 후 "미리보기" 핸들러. */
  onPreview?: () => void;
  /** 완료 후 추가 액션 슬롯(예: mp4 다운로드). done 일 때만 렌더. */
  downloadSlot?: React.ReactNode;
  // ── 후방 호환(미사용) — 기존 호출부가 넘기는 props 를 받아 무시한다. ──
  percent?: number;
  activeStage?: number;
  qaTotal?: number;
  qaReady?: number;
  qaFailed?: number;
  expectedDuration?: string;
  monthlyUsed?: number;
  monthlyLimit?: number;
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
  maxWidth: 640,
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

type BarTone = "done" | "active" | "pending" | "failed";
interface BarDef {
  key: string;
  label: string;
  sub: string;
  percent: number;
  tone: BarTone;
  indeterminate?: boolean;
}

export default function GenerationModal({
  open,
  eta,
  lectureTitle,
  slideCount,
  processedSlides,
  qaItems = [],
  done = false,
  onBackground,
  stalled = false,
  onRetry,
  onDevAdd,
  onDevComplete,
  onDevBackground,
  onViewVideo,
  onPreview,
  downloadSlot,
}: GenerationModalProps) {
  const [confettiBits, setConfettiBits] = useState<
    { left: number; delay: number; bg: string }[]
  >([]);

  useEffect(() => {
    if (!done) return;
    const palette = ["#FFB627", "#E89E0E", "#10B981", "#A78BFA", "#22D3EE"];
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

  // ── 단계별 바 구성 ──────────────────────────────────────────────────────────
  // ① 스크립트 검토(즉시 완료) ② 음성 합성(TTS, 슬라이드 완료율) ③ 추천 질문 답변
  // (HeyGen 영상 1개당 1개 바, 상태로 결정). 슬라이드·추천 질문은 병렬 진행이라
  // 각 바가 독립적으로 채워진다.
  const doneSlides = Math.min(processedSlides, slideCount);
  const slidePct =
    slideCount > 0 ? Math.round((doneSlides / slideCount) * 100) : 0;

  const bars: BarDef[] = [
    {
      key: "script",
      label: "① 스크립트 검토",
      sub: `${slideCount} / ${slideCount} 슬라이드 채택`,
      percent: 100,
      tone: "done",
    },
    {
      key: "tts",
      label: "② 음성 합성 (TTS)",
      sub: `${doneSlides} / ${slideCount} 슬라이드`,
      percent: slidePct,
      tone: slidePct >= 100 ? "done" : "active",
    },
  ];
  qaItems.forEach((q, i) => {
    const st = (q?.status as SeedRenderStatus) ?? "pending";
    let percent = 0;
    let tone: BarTone = "pending";
    let sub = "대기 중";
    let indeterminate = false;
    if (st === "ready") {
      percent = 100;
      tone = "done";
      sub = "완료";
    } else if (st === "failed") {
      percent = 100;
      tone = "failed";
      sub = "실패";
    } else if (st === "rendering") {
      percent = 100;
      tone = "active";
      sub = "제작 중…";
      indeterminate = true;
    }
    bars.push({
      key: `qa${i}`,
      label: `③ 추천 질문 답변 ${i + 1}`,
      sub,
      percent,
      tone,
      indeterminate,
    });
  });

  const doneCount = bars.filter((b) => b.tone === "done").length;
  // 추천 질문(Q&A) 답변 실패 개수 — 슬라이드 쇼가 끝나도 Q&A 가 실패했으면 "완성"
  // 으로 축하하지 않고 사실대로 알린다(실패를 완성으로 숨기지 않는다).
  const qaFailedCount = qaItems.filter((q) => q?.status === "failed").length;
  const qaReadyCount = qaItems.filter((q) => q?.status === "ready").length;
  // done(슬라이드 완료) 이면서 Q&A 가 하나라도 실패 → '부분 완료'. 축하·confetti 금지.
  const hasFailure = done && qaFailedCount > 0;
  // 아직 진행 중인(미완성·미실패) Q&A 답변 수 — pending/rendering/무상태. 슬라이드가
  // 끝나도 이게 남아 있으면 아직 '완성'이 아니다(추천 질문 답변까지 끝나야 완성).
  const qaInProgress = qaItems.filter(
    (q) => q?.status !== "ready" && q?.status !== "failed",
  ).length;
  // 진짜 완성 — 슬라이드 완료 + Q&A 진행분 없음 + 실패 없음. 이때만 "완성" + confetti.
  // (parent 의 done 이 슬라이드만 보고 일찍 true 가 돼도, 모달이 Q&A 상태로 한 번 더
  // 게이팅해 Q&A 가 '대기 중'인데 "완성"이라 뜨는 일을 막는다.)
  const fullyDone = done && qaInProgress === 0 && qaFailedCount === 0;
  // 전체 진척률(슬라이드 단계 + Q&A 답변을 하나의 %로) — "조금도 안 올라간다" 체감을
  // 없앤다. 각 바 균등 가중: done=1, TTS=슬라이드 완료율, 렌더 중 Q&A=0.5, 그 외=0.
  const progressUnits = bars.reduce((sum, b) => {
    if (b.tone === "done") return sum + 1;
    if (b.key === "tts") return sum + slidePct / 100;
    if (b.tone === "active") return sum + 0.5;
    return sum;
  }, 0);
  const overallPct = bars.length
    ? Math.round((progressUnits / bars.length) * 100)
    : 0;
  // 진행 중 격려 메시지 — 단계별로 바꿔 기다리는 체감을 낫게 한다.
  const progressMsg =
    overallPct >= 90
      ? "거의 다 끝났어요! 🎉"
      : overallPct >= 60
        ? "자, 쭉쭉 갑니다~ 조금만 더요!"
        : overallPct >= 30
          ? "한창 만드는 중이에요. 곧 따라잡을게요!"
          : "조금만 기다려 주세요. 서둘러 작업할게요!";

  return (
    <div
      style={overlayStyle(open)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="gen-h1"
      onClick={(e) => {
        if (e.target === e.currentTarget) onBackground?.();
      }}
    >
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
            {onDevComplete && (
              <DevBtn onClick={onDevComplete}>DEV: 즉시 완료</DevBtn>
            )}
            {onDevBackground && (
              <DevBtn onClick={onDevBackground}>DEV: 백그라운드</DevBtn>
            )}
          </div>
        )}

        {/* Confetti — 슬라이드+Q&A 까지 모두 완성됐을 때만(실패·진행 중이면 금지). */}
        {fullyDone && (
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
          </div>
        )}

        {/* 바 채움/인디터미네이트/컨페티 keyframes */}
        <style>{`
          @keyframes gen-confetti-fall {
            0% { transform: translateY(0) rotate(0deg); opacity: 1; }
            100% { transform: translateY(700px) rotate(720deg); opacity: 0; }
          }
          @keyframes gen-bar-indet {
            0% { left: -40%; }
            100% { left: 100%; }
          }
          @media (prefers-reduced-motion: reduce) {
            @keyframes gen-confetti-fall { 0%,100% { transform: translateY(0); opacity: 0; } }
            @keyframes gen-bar-indet { 0%,100% { left: 30%; } }
          }
        `}</style>

        <div style={{ overflowY: "auto", padding: "30px 34px 26px" }}>
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: 22 }}>
            <h2
              id="gen-h1"
              style={{
                ...displayStyle,
                margin: 0,
                marginBottom: 6,
                fontSize: 26,
                fontWeight: 700,
                color: "var(--text)",
              }}
            >
              {fullyDone
                ? "모두 완성되었어요! 🎉"
                : hasFailure
                  ? "슬라이드 쇼는 완성 — 단, Q&A 답변 일부 실패"
                  : !done
                    ? "슬라이드 쇼 만드는 중…"
                    : "추천 질문 답변 만드는 중…"}
            </h2>
            <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
              {lectureTitle} · 슬라이드 {slideCount}장
              <span style={{ ...tabularStyle }}>
                {" · "}
                {doneCount} / {bars.length} 단계 완료
                {!fullyDone ? ` · 전체 ${overallPct}%` : null}
              </span>
              {!fullyDone && eta ? (
                <span style={{ ...tabularStyle }}> · 예상 {eta}</span>
              ) : null}
            </div>
            {/* 진행 중 격려 메시지 — 단계별로 바뀌어 기다림 체감을 낫게 한다. */}
            {!fullyDone && !hasFailure && (
              <div
                style={{
                  marginTop: 10,
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--gold-on-light, #B88308)",
                }}
              >
                {progressMsg}
              </div>
            )}
            {hasFailure && (
              <div
                style={{
                  marginTop: 10,
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "rgba(180,35,24,0.08)",
                  border: "1px solid rgba(180,35,24,0.2)",
                  color: "#B42318",
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                추천 질문 답변 <b>{qaFailedCount}개 실패</b>
                {qaReadyCount > 0 ? ` (성공 ${qaReadyCount}개)` : ""}. 슬라이드 쇼는
                정상이지만 실패한 Q&A 답변 영상은 만들어지지 않았어요. 각 추천 질문
                카드에 표시된 <b>실패 사유</b>를 확인하고 ‘다시 제작’으로 재시도하세요.
              </div>
            )}
          </div>

          {/* 단계별 가로 바 */}
          <div style={{ marginBottom: 20 }}>
            {bars.map(({ key, ...rest }) => (
              <ProgressBar key={key} {...rest} />
            ))}
          </div>

          {/* 멈춤 감지 — 진행이 오래 정체되면 재시도 안내 (done 이전만) */}
          {!done && stalled && onRetry && (
            <div
              style={{
                border: "1px solid var(--gold-on-light, #B88308)",
                borderRadius: 12,
                padding: "14px 18px",
                marginBottom: 16,
                background: "var(--gold-soft, #FDF6E3)",
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--text)",
                  marginBottom: 6,
                }}
              >
                진행이 멈춘 것 같나요?
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  marginBottom: 12,
                  lineHeight: 1.5,
                }}
              >
                한동안 진척이 없으면 일부 합성이 중단됐을 수 있어요. 다시 시도하면
                완성된 부분은 그대로 두고 남은 부분만 이어서 만듭니다(완료분 비용 0).
              </div>
              <button
                type="button"
                onClick={onRetry}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 14px",
                  border: "none",
                  borderRadius: 8,
                  background: "linear-gradient(135deg, #FFB627, #E89E0E)",
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: "#0A0A0A",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                다시 시도
                <svg
                  viewBox="0 0 24 24"
                  width="13"
                  height="13"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M23 4v6h-6" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
              </button>
            </div>
          )}

          {/* 백그라운드 옵션 — done 이전만 */}
          {!done && onBackground && (
            <div
              style={{
                border: "1px solid var(--line)",
                borderRadius: 12,
                padding: "16px 18px",
                background: "var(--bg)",
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--text)",
                  marginBottom: 8,
                }}
              >
                백그라운드 실행
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  marginBottom: 12,
                }}
              >
                이 창을 닫아도 서버에서 계속 제작됩니다. 완성된 슬라이드 쇼는 강의
                페이지에서 확인하실 수 있어요.
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
            padding: "14px 34px",
            borderTop: "1px solid var(--line)",
            background: "var(--bg-card)",
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: 11.5, color: "var(--text-subtle)" }}>
            진행 상황은 자동으로 저장됩니다.
          </div>
          {done && (onPreview || onViewVideo) ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              {downloadSlot}
              {onPreview && (
                <PrimaryButton
                  variant="primary"
                  size="md"
                  onClick={onPreview}
                  trailingIcon={
                    <svg
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.4}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
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
                    <svg
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.4}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
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

function ProgressBar({
  label,
  sub,
  percent,
  tone,
  indeterminate,
}: Omit<BarDef, "key">) {
  const fill =
    tone === "done"
      ? "linear-gradient(90deg, #10B981, #059669)"
      : tone === "failed"
        ? "#EF4444"
        : tone === "active"
          ? "linear-gradient(90deg, #FFB627, #E89E0E)"
          : "#D9D7CF";
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: tone === "pending" ? "var(--text-muted)" : "var(--text)",
            minWidth: 0,
          }}
        >
          {label}
          <span
            style={{
              fontSize: 11.5,
              fontWeight: 500,
              color: "var(--text-subtle)",
            }}
          >
            {" · "}
            {sub}
          </span>
        </span>
        <span
          style={{
            ...tabularStyle,
            fontSize: 12.5,
            fontWeight: 700,
            flexShrink: 0,
            color: tone === "failed" ? "#EF4444" : "var(--text)",
          }}
        >
          {tone === "failed" ? "실패" : indeterminate ? "제작 중" : `${percent}%`}
        </span>
      </div>
      <div
        style={{
          height: 8,
          borderRadius: 999,
          background: "#EFEEE9",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {indeterminate ? (
          <div
            style={{
              position: "absolute",
              top: 0,
              height: "100%",
              width: "40%",
              borderRadius: 999,
              background: fill,
              animation: "gen-bar-indet 1.2s ease-in-out infinite",
            }}
          />
        ) : (
          <div
            style={{
              height: "100%",
              width: `${Math.max(0, Math.min(100, percent))}%`,
              borderRadius: 999,
              background: fill,
              transition: "width 500ms var(--ease-out)",
            }}
          />
        )}
      </div>
    </div>
  );
}

function DevBtn({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
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
