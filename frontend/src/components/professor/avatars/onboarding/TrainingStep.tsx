"use client";

import type { CSSProperties } from "react";
import type { PhotoAvatarGroupStatus } from "./photoAvatarTypes";
import { PersonIcon } from "./PhotoAvatarIcons";

interface TrainingStepProps {
  status: PhotoAvatarGroupStatus;
  reducedMotion: boolean;
  /** 학습이 예상보다 오래 걸리는 중인지 — 안내 문구를 추가로 노출한다. */
  stalled?: boolean;
  /** 다시 사진 업로드(이전 단계로). */
  onReupload: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * ② "본인 아바타 준비 중" — 그룹 학습 상태 폴링 화면.
 *
 * 학습이 끝나면 부모(usePhotoAvatarFlow)가 자동으로 룩 생성 단계로 넘긴다.
 * 실패 시 다시 업로드하도록 안내한다. 애니메이션은 prefers-reduced-motion
 * 에서 정지 펄스(투명도 고정)로 대체한다.
 */
export default function TrainingStep({
  status,
  reducedMotion,
  stalled = false,
  onReupload,
  t,
}: TrainingStepProps) {
  const failed = status === "failed";
  const showStalled = stalled && !failed;

  return (
    <div data-testid="step-training" style={cardStyle}>
      <div style={{ display: "grid", placeItems: "center", gap: 18, padding: "16px 0" }}>
        <div
          aria-hidden="true"
          style={{
            position: "relative",
            width: 96,
            height: 96,
            display: "grid",
            placeItems: "center",
          }}
        >
          {/* 골드 링 — 회전(모션 허용 시). reduce 면 렌더하지 않음.
              keyframe 은 globals.css 의 `studio-spin` 재사용(전역 정의, 창1 소유 —
              편집 없이 inline animation 으로 참조). */}
          {!reducedMotion && !failed && <span style={spinnerRing} />}
          <span
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: failed ? "var(--bg-subtle)" : "var(--gold-soft)",
              border: `2px solid ${failed ? "var(--line-strong)" : "var(--gold-medium)"}`,
              display: "grid",
              placeItems: "center",
            }}
          >
            <PersonIcon
              size={36}
              mono={failed}
              style={failed ? { color: "var(--text-faint)" } : undefined}
            />
          </span>
        </div>

        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <h2 style={headingStyle}>
            {failed ? t("training.failedTitle") : t("training.title")}
          </h2>
          <p style={descStyle}>
            {failed ? t("training.failedDescription") : t("training.description")}
          </p>
        </div>

        {failed ? (
          <button
            type="button"
            onClick={onReupload}
            data-testid="training-retry"
            style={primaryBtn}
          >
            {t("training.retry")}
          </button>
        ) : (
          <div
            role="status"
            aria-live="polite"
            data-testid="training-status"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 14px",
              borderRadius: 999,
              fontSize: 12.5,
              fontWeight: 600,
              color: "var(--gold-on-light)",
              background: "var(--gold-soft)",
              border: "1px solid var(--gold-medium)",
            }}
          >
            <span style={statusDot} aria-hidden="true" />
            {t("training.badge")}
          </div>
        )}

        {showStalled && (
          <p
            role="status"
            aria-live="polite"
            data-testid="training-stalled"
            style={stalledNote}
          >
            {t("training.stalledNote")}
          </p>
        )}

        {!failed && (
          <button
            type="button"
            onClick={onReupload}
            style={ghostLink}
            data-testid="training-reupload"
          >
            {showStalled ? t("training.retry") : t("training.reupload")}
          </button>
        )}
      </div>
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

const spinnerRing: CSSProperties = {
  position: "absolute",
  inset: 0,
  borderRadius: "50%",
  border: "3px solid var(--gold-soft)",
  borderTopColor: "var(--gold)",
  // globals.css 전역 keyframe 재사용 (studio-slide-spinner 와 동일).
  animation: "studio-spin 0.9s linear infinite",
};

const statusDot: CSSProperties = {
  width: 7,
  height: 7,
  borderRadius: "50%",
  background: "var(--gold)",
  flexShrink: 0,
};

const headingStyle: CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 700,
  color: "var(--text)",
};

const descStyle: CSSProperties = {
  margin: "8px 0 0",
  fontSize: 13.5,
  lineHeight: 1.6,
  color: "var(--text-muted)",
};

const primaryBtn: CSSProperties = {
  padding: "9px 18px",
  fontSize: 13,
  fontWeight: 700,
  borderRadius: 10,
  border: "1px solid transparent",
  background: "linear-gradient(135deg, #FFB627, #E89E0E)",
  color: "#0A0A0A",
  cursor: "pointer",
  fontFamily: "inherit",
};

const stalledNote: CSSProperties = {
  margin: 0,
  maxWidth: 420,
  textAlign: "center",
  fontSize: 12.5,
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
};
