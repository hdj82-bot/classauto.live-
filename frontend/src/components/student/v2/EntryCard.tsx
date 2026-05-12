"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { startGoogleLogin } from "@/lib/auth";
import tokens from "./tokens-v2.module.css";
import styles from "./StudentEntry.module.css";
import CourseTitle from "./CourseTitle";

/**
 * EntryCard — /v/[slug] 진입 페이지의 본문 카드 그룹.
 *
 * 출처: docs/prototypes/06-student-flow.extracted.html SCREEN 1.
 * docs/planning/06-student-pages.md §3 의 화면 구성과 stagger 80/160/240/320/
 * 400ms 카드 fade-in 을 1:1 그대로 옮겼다.
 *
 * 비로그인 사용자는 "학교 이메일로 시작 →" 클릭 시 Google OAuth(role=student)
 * 로 이동. 로그인 후 페이지가 학생 역할로 다시 로드되면 본 카드 대신
 * /lecture/[slug] 로 자동 이동(부모 페이지가 처리).
 */
export interface EntryCardProps {
  slug: string;
  /** 백엔드 LecturePublicResponse 의 일부. 빈 값은 graceful fallback. */
  title: string;
  description: string | null;
  professorName: string | null;
  courseName: string | null;
  schoolName: string | null;
  durationSec: number | null;
  weekNumber: number | null;
  lessonNumber: number | null;
  watchingCount: number | null;
  avgAccuracy: number | null;
  signupHref: string;
  /** 개발 환경에서 mock 데이터로 렌더링 중임을 알리는 작은 배지. */
  mocked?: boolean;
}

export default function EntryCard(props: EntryCardProps) {
  const {
    slug,
    title,
    description,
    professorName,
    courseName,
    schoolName,
    durationSec,
    weekNumber,
    lessonNumber,
    watchingCount,
    avgAccuracy,
    signupHref,
    mocked,
  } = props;
  const router = useRouter();
  const { t } = useI18n();
  const [redirecting, setRedirecting] = useState(false);

  const handleEmailLogin = () => {
    if (redirecting) return;
    setRedirecting(true);
    // 진입 페이지에서 로그인하면 다시 /v/[slug] 로 돌아와 학생 역할이면
    // /lecture/[slug] 로 자동 진입한다 (StudentEntryContent 의 useEffect 분기).
    try {
      window.sessionStorage.setItem(
        "ifl_post_login_redirect",
        `/v/${encodeURIComponent(slug)}`,
      );
    } catch {
      /* sessionStorage 차단 환경(iOS private 등)은 graceful */
    }
    startGoogleLogin("student");
  };

  const handleCodeStart = () => {
    // 학습 코드 흐름은 후속 PR(BACKEND_ASKS.W4) 에서 / auth/code 로 연결.
    // 현재는 signup 라우트로 보내 코드 입력 자리 제공.
    router.push(signupHref);
  };

  const initial = (professorName ?? "?").trim().charAt(0) || "?";

  return (
    <div className={styles.wrap}>
      {mocked && (
        <span className={styles.mockPill} role="note" aria-label="dev mock">
          DEV MOCK
        </span>
      )}

      {/* 1) Sender (80ms) — 교수자 신뢰 라인 */}
      <div className={`${styles.sender} ${tokens.fadeIn80}`}>
        <div className={styles.senderAvatar} aria-hidden="true">
          {initial}
        </div>
        <div className={styles.senderText}>
          <div className={styles.senderWho}>
            {professorName ? (
              <>
                <strong>
                  {t("student.entry.fromProfessor", { name: professorName })}
                </strong>
              </>
            ) : (
              t("student.entry.fromProfessorAnon")
            )}
          </div>
          {(schoolName || courseName) && (
            <div className={styles.senderSub}>
              {[schoolName, courseName].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
        <span
          className={styles.senderVerified}
          title={t("student.entry.senderVerifiedTitle")}
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          {t("student.entry.verifiedBadge")}
        </span>
      </div>

      {/* 2) Course card (160ms) — 주차/타이틀/메타/스탯 */}
      <div className={`${styles.course} ${tokens.fadeIn160}`}>
        <div className={styles.courseHead}>
          <div className={styles.courseIcon} aria-hidden="true">
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="url(#ca-grad-violet)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14z" />
              <path d="M6.5 17H20v4H6.5A2.5 2.5 0 0 1 4 18.5v0A2.5 2.5 0 0 1 6.5 17z" />
              <path d="M9 7h7" />
            </svg>
          </div>
          <div className={styles.courseMeta}>
            {weekNumber !== null && lessonNumber !== null ? (
              <div className={styles.courseTag}>
                {t("student.entry.courseTagLesson", {
                  week: String(weekNumber),
                  lesson: String(lessonNumber).padStart(2, "0"),
                })}
              </div>
            ) : weekNumber !== null ? (
              <div className={styles.courseTag}>
                {t("student.entry.courseTagLesson", {
                  week: String(weekNumber),
                  lesson: "—",
                })}
              </div>
            ) : null}

            <CourseTitle title={title} />

            {(schoolName || courseName) && (
              <div className={styles.courseSub}>
                {schoolName && <span>{schoolName}</span>}
                {schoolName && courseName && (
                  <span className="dot" aria-hidden="true">
                    ·
                  </span>
                )}
                {courseName && <span>{courseName}</span>}
              </div>
            )}
          </div>
        </div>

        {(durationSec || watchingCount || avgAccuracy !== null) && (
          <div className={styles.courseStats}>
            {durationSec && durationSec > 0 && (
              <div className={styles.stat} title={t("student.entry.statDuration")}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="url(#ca-grad-cyan)"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9" />
                  <polyline points="12 7 12 12 15 14" />
                </svg>
                <span className={tokens.numeric}>
                  <span className={styles.statV}>{formatDuration(durationSec)}</span>
                </span>
              </div>
            )}
            {watchingCount !== null && watchingCount > 0 && (
              <div className={styles.stat} title={t("student.entry.statLearners")}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="url(#ca-grad-violet)"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <span className={tokens.numeric}>
                  {t("student.entry.statLearnerCount", {
                    count: String(watchingCount),
                  })}
                </span>
              </div>
            )}
            {avgAccuracy !== null && avgAccuracy > 0 && (
              <div className={styles.stat} title={t("student.entry.statAccuracy")}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="url(#ca-grad-success)"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="3 17 9 11 13 15 21 7" />
                  <polyline points="14 7 21 7 21 14" />
                </svg>
                <span className={tokens.numeric}>
                  <span className={styles.statV}>{Math.round(avgAccuracy)}%</span>
                </span>
              </div>
            )}
          </div>
        )}

        {description && (
          <p
            style={{
              fontSize: "14px",
              color: "var(--text-light-muted)",
              lineHeight: 1.55,
              margin: 0,
            }}
          >
            {description}
          </p>
        )}
      </div>

      {/* 3) Reqs (240ms) — 시청 조건 */}
      <div className={`${styles.reqs} ${tokens.fadeIn240}`}>
        <div className={styles.reqsTitle}>{t("student.entry.reqsTitle")}</div>
        <ul className={styles.reqsList}>
          <li>
            <svg
              className="ok"
              viewBox="0 0 24 24"
              fill="none"
              stroke="url(#ca-grad-success)"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {t("student.entry.reqsEmailLine")}{" "}
            <span style={{ color: "var(--text-light-subtle)" }}>(.ac.kr / .edu)</span>
          </li>
          <li>
            <span className="or">{t("student.entry.reqsOr")}</span>
            {t("student.entry.reqsCodeLine")}{" "}
            <code className={tokens.numeric}>ABCD-1234</code>
          </li>
        </ul>
      </div>

      {/* 4) Actions (320ms) — 두 개 CTA */}
      <div className={`${styles.actions} ${tokens.fadeIn320}`}>
        <button
          type="button"
          className={`${tokens.btn} ${tokens.btnGold}`}
          onClick={handleEmailLogin}
          disabled={redirecting}
        >
          <svg
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
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 6 9-6" />
          </svg>
          {redirecting
            ? t("student.signup.googleRedirecting")
            : t("student.entry.ctaEmailStart")}
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
          onClick={handleCodeStart}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="11" width="18" height="10" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          {t("student.entry.ctaCodeStart")}
          <svg
            className={tokens.btnArrow}
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="13 6 19 12 13 18" />
          </svg>
        </button>
      </div>

      {/* 5) Tutorial link (400ms) */}
      <div className={`${styles.tut} ${tokens.fadeIn400}`}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="url(#ca-grad-electric)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M9 18h6M10 22h4M12 2a7 7 0 0 1 4 12.7c-.5.4-.8.9-.9 1.5l-.1.8H9.1l-.1-.8c-.1-.6-.4-1.1-.9-1.5A7 7 0 0 1 12 2z" />
        </svg>
        {t("student.entry.tutHook")}{" "}
        <a href="/help">{t("student.entry.tutLink")}</a>
      </div>

      {/* 6) Foot (480ms) */}
      <div className={`${styles.foot} ${tokens.fadeIn480}`}>
        <div>{t("student.entry.footNotice")}</div>
        <div>
          <a href="/trust">{t("student.entry.footPrivacyLink")}</a>
        </div>
      </div>
    </div>
  );
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  if (m === 0) return `${s}초`;
  return `${m}분 ${s.toString().padStart(2, "0")}초`;
}
