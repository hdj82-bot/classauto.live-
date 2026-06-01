"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { Look, LookGenerateInput } from "./photoAvatarTypes";

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
  /** 다른 생성/폴링이 진행 중이면 disabled. */
  busy: boolean;
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
  busy,
  t,
}: LookDetailModalProps) {
  const [extra, setExtra] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Esc 로 닫기, body 스크롤 잠금.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const src = look.image_url ?? look.preview_image_url ?? "";
  const disabled = busy || submitting || extra.trim().length === 0;

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
      onClose();
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
          <h3 style={titleStyle}>{t("looks.detail.title")}</h3>
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
          <div style={frame169} aria-label={look.prompt || t("looks.tileAlt")}>
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt={look.prompt || t("looks.tileAlt")}
                style={img169}
              />
            ) : null}
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
          <p style={helpText}>{t("looks.detail.extraHelp")}</p>
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
  width: "min(960px, 100%)",
  maxHeight: "92vh",
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
};

const frame169: CSSProperties = {
  width: "100%",
  aspectRatio: "16 / 9",
  borderRadius: 12,
  background: "#0A0A0A",
  display: "grid",
  placeItems: "center",
  overflow: "hidden",
};

const img169: CSSProperties = {
  maxWidth: "100%",
  maxHeight: "100%",
  width: "auto",
  height: "100%",
  objectFit: "contain",
  display: "block",
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
