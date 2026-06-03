"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { Look, LookGenerateInput } from "./photoAvatarTypes";
import LookProgressRing from "./LookProgressRing";

interface LookDetailModalProps {
  look: Look;
  /** 직전 룩 배치 생성에 사용된 입력 — 재생성 시 base 로 재사용한다. */
  lastInput: LookGenerateInput | null;
  /** 입력(persona/outfit/bg/expression) + 새 extra 로 재생성. */
  onRegenerate: (input: LookGenerateInput) => Promise<void>;
  /** 룩 삭제(라이브러리에서 제거). 제공되지 않으면 삭제 버튼을 노출하지 않는다. */
  onDelete?: (lookId: string) => Promise<void>;
  /** 모달 닫기. */
  onClose: () => void;
  /** 이전 룩으로 이동(없으면 좌측 화살표 숨김 — 맨 앞). */
  onPrev?: () => void;
  /** 다음 룩으로 이동(없으면 우측 화살표 숨김 — 맨 뒤). */
  onNext?: () => void;
  /** 생성 중 룩의 진행률 링 애니메이션 감속용. */
  reducedMotion?: boolean;
  /** 다른 생성/폴링이 진행 중이면 삭제 버튼을 disabled. (재생성은 막지 않는다 —
   *  백엔드가 누적 cap 으로 과생성을 통제하므로, 진행 중이어도 추가 요청은 받는다.) */
  busy: boolean;
  /** 누적 한도(LOOK_TOTAL_MAX) 도달 — 재생성 버튼을 비활성하고 안내한다. */
  capReached?: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * 룩 1개를 16:9 큰 화면으로 확인하는 모달. 첫 룩 생성에서는 노출하지 않던
 * "추가 요청" 입력이 **이 화면에서만** 활성화된다(2026-06-01 정책).
 *
 * 재생성은 직전 배치 입력(persona/outfit/bg/expression)을 기본으로 유지하고
 * 사용자가 입력한 extra 만 새로 반영한다(룩의 정체성을 유지하면서 색·표정 등
 * 미세 조정). lastInput 이 없으면(서버 복원 직후 등) educator 기본값을 쓴다.
 *
 * 룩 이미지는 1024x1024 정사각이므로 16:9 프레임 안에 ``object-fit: contain``
 * 으로 letterbox 표시한다(강의 영상이 16:9 라 같은 톤으로 확인할 수 있음).
 */
export default function LookDetailModal({
  look,
  lastInput,
  onRegenerate,
  onDelete,
  onClose,
  onPrev,
  onNext,
  reducedMotion,
  busy,
  capReached = false,
  t,
}: LookDetailModalProps) {
  const [extra, setExtra] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isGenerating = look.status === "generating";

  // Esc 로 닫기, ←/→ 로 이전·다음 룩 이동, body 스크롤 잠금. 화살표는 입력 중
  // (textarea/input)에는 커서 이동을 위해 가로채지 않는다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      if (e.key === "ArrowLeft") onPrev?.();
      else if (e.key === "ArrowRight") onNext?.();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, onPrev, onNext]);

  // 다른 룩으로 전환(화살표 이동·재생성 후 새 룩으로 점프)되면 입력칸을 비운다 —
  // 이전 룩에 쓰던 "추가 요청"이 다음 룩으로 새어가지 않게.
  useEffect(() => {
    setExtra("");
  }, [look.look_id]);

  const src = look.image_url ?? look.preview_image_url ?? "";
  // busy(다른 룩 생성 중)는 더는 재생성을 막지 않는다 — 막으면 버튼이 말없이
  // 죽어 "반응 없음"으로 보였다. 한도 도달(capReached)·빈 입력·전송 중만 막는다.
  const disabled = submitting || capReached || extra.trim().length === 0;

  const handleRegenerate = async () => {
    if (disabled) return;
    setSubmitting(true);
    try {
      // lastInput 이 없으면 educator 기본값 — 룩의 prompt 가 더 정확하지만,
      // structured input 으로의 역변환은 비결정이라 기본값 채택.
      await onRegenerate({
        persona: lastInput?.persona ?? "educator",
        outfit: lastInput?.outfit ?? null,
        background: lastInput?.background ?? null,
        expression: lastInput?.expression ?? null,
        extra: extra.trim(),
      });
      // 닫지 않는다 — 부모가 새로 생긴 룩(생성 중)으로 모달을 전환하면 그 룩의
      // 진행률(%)이 이 자리에서 바로 보인다(look_id 변경 → extra 자동 초기화).
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete || deleting || busy) return;
    // 단순 confirm — 베타 UX 비용 최소화(전용 confirmation modal 도입은 과함).
    if (typeof window !== "undefined" && !window.confirm(t("looks.detail.deleteConfirm"))) {
      return;
    }
    setDeleting(true);
    try {
      await onDelete(look.look_id);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("looks.detail.title")}
      onClick={onClose}
      style={overlayStyle}
      data-testid="look-detail-modal"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={dialogStyle}
      >
        <header style={headerStyle}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <h3 style={titleStyle}>{t("looks.detail.title")}</h3>
            {/* 영어 프롬프트 대신 한국어 카테고리 조합을 부제로 노출(2026-06-02). */}
            {look.categoryLabel && (
              <span style={subtitleStyle}>{look.categoryLabel}</span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={closeBtn}
            aria-label={t("looks.detail.close")}
            data-testid="look-detail-close"
          >
            ×
          </button>
        </header>

        <div style={bodyStyle}>
          <div style={frameStyle} aria-label={look.categoryLabel || t("looks.tileAlt")}>
            {isGenerating ? (
              // 생성 중(재생성 직후 등) — 이미지 대신 큰 진행률(%)을 보여준다.
              <div style={generatingArea}>
                <LookProgressRing
                  createdAt={look.createdAt}
                  reducedMotion={reducedMotion}
                  size={120}
                  t={t}
                />
              </div>
            ) : src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt={look.categoryLabel || t("looks.tileAlt")}
                style={imgStyle}
              />
            ) : null}

            {/* 좌우 화살표 — 모달을 닫지 않고 이전/다음 룩을 바로 열람. */}
            {onPrev && (
              <button
                type="button"
                onClick={onPrev}
                style={{ ...navArrow, left: 12 }}
                aria-label={t("looks.detail.prev")}
                data-testid="look-detail-prev"
              >
                <ChevronIcon dir="left" />
              </button>
            )}
            {onNext && (
              <button
                type="button"
                onClick={onNext}
                style={{ ...navArrow, right: 12 }}
                aria-label={t("looks.detail.next")}
                data-testid="look-detail-next"
              >
                <ChevronIcon dir="right" />
              </button>
            )}
          </div>

          <label style={extraLabel}>
            {t("looks.detail.extraLabel")}
            <textarea
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              maxLength={500}
              placeholder={t("looks.detail.extraPlaceholder")}
              rows={3}
              data-testid="look-detail-extra"
              style={extraInput}
            />
          </label>
          {capReached ? (
            <p style={capNote} data-testid="look-detail-cap">
              {t("looks.detail.capReachedNote")}
            </p>
          ) : (
            <p style={helpText}>{t("looks.detail.extraHelp")}</p>
          )}
        </div>

        <footer style={footerStyle}>
          {onDelete ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting || busy}
              data-testid="look-detail-delete"
              style={{
                ...dangerBtn,
                opacity: deleting || busy ? 0.5 : 1,
                cursor: deleting || busy ? "not-allowed" : "pointer",
                marginRight: "auto",
              }}
            >
              {deleting
                ? t("looks.detail.deleting")
                : t("looks.detail.delete")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            style={secondaryBtn}
            data-testid="look-detail-cancel"
          >
            {t("looks.detail.close")}
          </button>
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={disabled}
            data-testid="look-detail-regenerate"
            style={{
              ...primaryBtn,
              opacity: disabled ? 0.5 : 1,
              cursor: disabled ? "not-allowed" : "pointer",
            }}
          >
            {submitting
              ? t("looks.detail.regenerating")
              : t("looks.detail.regenerate")}
          </button>
        </footer>
      </div>
    </div>
  );
}

function ChevronIcon({ dir }: { dir: "left" | "right" }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {dir === "left" ? (
        <polyline points="15 18 9 12 15 6" />
      ) : (
        <polyline points="9 18 15 12 9 6" />
      )}
    </svg>
  );
}

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(10, 10, 10, 0.72)",
  display: "grid",
  placeItems: "center",
  padding: 24,
  zIndex: 1000,
  animation: "studio-fade-in 140ms var(--ease-out)",
};

const dialogStyle: CSSProperties = {
  // 더 큰 창 — 가로(3:2) 룩이 잘리지 않고 넉넉히 보이도록(사용자 요청 2026-06-02).
  width: "min(1120px, 100%)",
  maxHeight: "94vh",
  display: "flex",
  flexDirection: "column",
  background: "var(--bg-card)",
  borderRadius: 18,
  border: "1px solid var(--line-strong)",
  boxShadow: "0 24px 64px rgba(0, 0, 0, 0.32)",
  overflow: "hidden",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "14px 20px",
  borderBottom: "1px solid var(--line)",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 15.5,
  fontWeight: 700,
  color: "var(--text)",
};

const subtitleStyle: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 600,
  color: "var(--gold-on-light, #B88308)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const closeBtn: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 8,
  border: "none",
  background: "transparent",
  fontSize: 22,
  lineHeight: 1,
  color: "var(--text-muted)",
  cursor: "pointer",
  fontFamily: "inherit",
};

const bodyStyle: CSSProperties = {
  padding: 20,
  display: "flex",
  flexDirection: "column",
  gap: 14,
  overflowY: "auto",
  // flex 컬럼(maxHeight 92vh + overflow:hidden) 안에서 스크롤이 실제로 동작하려면
  // 스크롤 영역에 flex:1 + minHeight:0 이 필요하다. 없으면 내용이 dialog 를 넘쳐
  // 하단(이미지 아래·footer)이 잘려 보인다. (사용자 보고: "하단이 짤린다".)
  flex: "1 1 auto",
  minHeight: 0,
};

// 2026-06-01 v2: 강제 16:9 프레임 → 자연 비율. 이전엔 정사각(1024x1024) 이미지를
// 16:9 프레임에 letterbox 하면서 사용자가 "양옆 잘림 / 얼굴만 확대" 로 인식했다.
// 이제 백엔드가 1536x1024 (3:2 가로) 로 만들고 모달도 자연 비율로 보여준다.
// max-height: 70vh 로 화면을 넘지 않게 하고, 너비는 컨테이너에 맞춰 줄어든다.
const frameStyle: CSSProperties = {
  position: "relative", // 좌우 화살표(navArrow) 기준.
  width: "100%",
  borderRadius: 12,
  background: "#0A0A0A",
  display: "grid",
  placeItems: "center",
  overflow: "hidden",
};

// 생성 중 룩의 진행률 영역 — 이미지가 없을 때 16:9 자리를 차지해 모달이 안 무너지게.
const generatingArea: CSSProperties = {
  width: "100%",
  aspectRatio: "16 / 9",
  display: "grid",
  placeItems: "center",
};

// 좌우 네비게이션 화살표 — 프레임 위에 떠 있는 원형 버튼.
const navArrow: CSSProperties = {
  position: "absolute",
  top: "50%",
  transform: "translateY(-50%)",
  width: 40,
  height: 40,
  borderRadius: "50%",
  border: "none",
  background: "rgba(10, 10, 10, 0.55)",
  color: "#fff",
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  zIndex: 2,
  fontFamily: "inherit",
};

const imgStyle: CSSProperties = {
  display: "block",
  width: "100%",
  height: "auto",
  maxHeight: "70vh",
  objectFit: "contain",
};

const extraLabel: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 12.5,
  fontWeight: 700,
  color: "var(--text-muted)",
};

const extraInput: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  fontSize: 13,
  borderRadius: 10,
  border: "1px solid var(--line-strong)",
  background: "var(--bg)",
  color: "var(--text)",
  fontFamily: "inherit",
  resize: "vertical",
  minHeight: 70,
};

const helpText: CSSProperties = {
  margin: 0,
  fontSize: 11.5,
  lineHeight: 1.5,
  color: "var(--text-faint)",
};

const capNote: CSSProperties = {
  margin: 0,
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1.5,
  color: "#D92D20",
};

const footerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  padding: "14px 20px",
  borderTop: "1px solid var(--line)",
  background: "var(--bg-subtle)",
};

const secondaryBtn: CSSProperties = {
  padding: "9px 16px",
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 10,
  border: "1px solid var(--line-strong)",
  background: "var(--bg-card)",
  color: "var(--text)",
  cursor: "pointer",
  fontFamily: "inherit",
};

const primaryBtn: CSSProperties = {
  padding: "9px 18px",
  fontSize: 13,
  fontWeight: 700,
  borderRadius: 10,
  border: "1px solid transparent",
  background: "linear-gradient(135deg, #FFB627, #E89E0E)",
  color: "#0A0A0A",
  fontFamily: "inherit",
};

const dangerBtn: CSSProperties = {
  padding: "9px 14px",
  fontSize: 12.5,
  fontWeight: 600,
  borderRadius: 10,
  border: "1px solid var(--line-strong)",
  background: "transparent",
  color: "var(--danger, #C0392B)",
  cursor: "pointer",
  fontFamily: "inherit",
};
