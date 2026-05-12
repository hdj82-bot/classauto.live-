"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/contexts/I18nContext";
import StudentSurfaceLight from "@/components/student/v2/StudentSurfaceLight";
import tokens from "@/components/student/v2/tokens-v2.module.css";
import styles from "@/components/student/v2/ExpiredCard.module.css";

/**
 * /expired — 시청 기간 만료 안내 페이지 (v2).
 *
 * 영상 없음 → 라이트 톤 (colors.md §1). 06 prototype 의 시계 / 마감 알림
 * 톤을 골드 글로우 illustration 으로 표현.
 */
export default function ExpiredPage() {
  const router = useRouter();
  const { t } = useI18n();

  return (
    <StudentSurfaceLight>
      <div className={`${styles.wrap} ${tokens.fadeIn80}`}>
        <span className={styles.kicker}>{t("student.expiredV2.kicker")}</span>

        <div className={styles.illust} aria-hidden="true">
          <svg viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="18" fill="url(#ca-grad-electric)" opacity="0.18" />
            <circle
              cx="24"
              cy="24"
              r="14"
              fill="none"
              stroke="url(#ca-grad-electric)"
              strokeWidth={2.5}
            />
            <path
              d="M24 16v8l5 3"
              stroke="#B88308"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </div>

        <h1 className={styles.title}>{t("student.expiredV2.title")}</h1>
        <p className={styles.desc}>{t("student.expiredV2.description")}</p>

        <div className={styles.actions}>
          <button
            type="button"
            className={`${tokens.btn} ${tokens.btnGold}`}
            onClick={() => router.push("/dashboard")}
          >
            {t("student.expiredV2.backToDashboard")}
            <svg
              className={tokens.btnArrow}
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="13 6 19 12 13 18" />
            </svg>
          </button>
          <button
            type="button"
            className={`${tokens.btn} ${tokens.btnOutlineLight}`}
            onClick={() => router.push("/")}
          >
            {t("student.expiredV2.browseLectures")}
          </button>
        </div>
      </div>
    </StudentSurfaceLight>
  );
}
