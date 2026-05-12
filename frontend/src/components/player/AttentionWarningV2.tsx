"use client";

import { useCallback, useEffect } from "react";
import { useI18n } from "@/contexts/I18nContext";
import styles from "./Player.module.css";

/**
 * AttentionWarningV2 — 3단계 집중 경고 오버레이.
 *
 * 출처: docs/planning/06-student-pages.md §8 + animations.md §5.3-5.4.
 *
 * 단계별 시각 강도:
 *  - level 1: 모달 없음. 가장자리 펄스 + 좌하단 작은 토스트.
 *  - level 2: 영상 흐림 + 큰 올빼미 + "계속 볼게요" 강조.
 *  - level 3: 영상 정지 + 3 가지 액션(처음부터 / 퀴즈 / 5분 후) +
 *             교수자 "주의 필요 학습자" 자동 등록은 백엔드 책임.
 *
 * 키보드: ESC · Enter · Space 로 즉시 resume (resume hint 표시).
 */
export interface AttentionWarningV2Props {
  level: 1 | 2 | 3;
  /** 학생이 "계속 볼게요" / 영상 클릭 / 키 입력 시 호출. */
  onResume: () => void;
  /** Level 3 의 보조 액션. 미지정 시 onResume 으로 fallback. */
  onRestart?: () => void;
  onTakeQuiz?: () => void;
  onSnooze?: () => void;
}

export default function AttentionWarningV2({
  level,
  onResume,
  onRestart,
  onTakeQuiz,
  onSnooze,
}: AttentionWarningV2Props) {
  const { t } = useI18n();

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onResume();
      }
    },
    [onResume],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  if (level === 1) {
    // Level 1: 가장자리 펄스 + 좌하단 작은 토스트. 영상은 계속 재생.
    return (
      <>
        <div
          className={`${styles.attnScrim} ${styles.level1}`}
          aria-hidden="true"
        />
        <div
          className={styles.attnLevel1Toast}
          role="status"
          aria-live="polite"
        >
          <span className={styles.owl} aria-hidden="true">
            <OwlMini />
          </span>
          <div>
            <div style={{ fontWeight: 600 }}>
              {t("student.playerV2.warning.level1Title")}
            </div>
            <div
              style={{
                color: "var(--text-dark-subtle)",
                fontSize: 12,
                marginTop: 2,
              }}
            >
              {t("student.playerV2.warning.level1Desc")}
            </div>
          </div>
          <button
            type="button"
            onClick={onResume}
            style={{
              marginLeft: 8,
              background: "var(--gold)",
              color: "#0A0A0A",
              border: "none",
              borderRadius: 8,
              padding: "6px 10px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            ✓
          </button>
        </div>
      </>
    );
  }

  const isLevel3 = level === 3;
  return (
    <div
      className={`${styles.attnScrim} ${isLevel3 ? styles.level3 : styles.level2}`}
      role="alertdialog"
      aria-modal="true"
      aria-label={t(`student.playerV2.warning.level${level}Title`)}
    >
      <div className={styles.attnCard}>
        <span className={styles.attnKicker}>
          {t("student.playerV2.warning.pausedKicker")}
          {" · "}
          {t("student.playerV2.warning.stageLabel", { current: String(level) })}
        </span>
        <div className={styles.attnOwl} aria-hidden="true">
          <OwlMini large />
        </div>
        <h2 className={styles.attnTitle}>
          {t(`student.playerV2.warning.level${level}Title`)}
        </h2>
        <p className={styles.attnDesc}>
          {t(`student.playerV2.warning.level${level}Desc`)}
        </p>

        <div className={styles.attnActions}>
          {!isLevel3 ? (
            <button
              type="button"
              autoFocus
              className={styles.attnPrimary}
              onClick={onResume}
            >
              {t("student.playerV2.warning.resume")}
            </button>
          ) : (
            <>
              <button
                type="button"
                autoFocus
                className={styles.attnPrimary}
                onClick={onTakeQuiz ?? onResume}
              >
                {t("student.playerV2.warning.level3OptQuiz")}
              </button>
              <button
                type="button"
                className={styles.attnSecondary}
                onClick={onRestart ?? onResume}
              >
                {t("student.playerV2.warning.level3OptRestart")}
              </button>
              <button
                type="button"
                className={styles.attnSecondary}
                onClick={onSnooze ?? onResume}
              >
                {t("student.playerV2.warning.level3OptLater")}
              </button>
            </>
          )}
        </div>

        <p className={styles.attnHint}>
          {t("student.playerV2.warning.resumeHint")}
        </p>
      </div>
    </div>
  );
}

function OwlMini({ large = false }: { large?: boolean }) {
  // mascot.md 회갈색 단색. 크기는 부모 SVG box 가 결정.
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
      <ellipse cx="16" cy="19" rx="9" ry="10" />
      <ellipse cx="16" cy="13" rx="8" ry="7" fill="#A99B7E" />
      <circle cx="12" cy="13" r="2" fill="#FFFFFF" />
      <circle cx="20" cy="13" r="2" fill="#FFFFFF" />
      <circle cx="12" cy="14" r={large ? 1.3 : 0.9} fill="#0A0A0A" />
      <circle cx="20" cy="14" r={large ? 1.3 : 0.9} fill="#0A0A0A" />
      {large && (
        <>
          <path d="M14 10c0-1.5 1-2.5 2-2.5s2 1 2 2.5" stroke="#5C5141" strokeWidth={1.2} fill="none" />
          <path d="M13 19q3 -2 6 0" stroke="#5C5141" strokeWidth={1.2} fill="none" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
