"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { startGoogleLogin } from "@/lib/auth";
import tokens from "./tokens-v2.module.css";
import styles from "./SignupV2.module.css";

/**
 * SignupWizard — /auth/signup 의 3단계 마법사.
 *
 * 출처: docs/prototypes/06-student-flow.extracted.html SCREEN 2
 *      + docs/planning/06-student-pages.md §4.
 *
 * Step 1: 학교 이메일 입력 (`.ac.kr` / `.edu` whitelist)
 * Step 2: 인증 메일 발송 안내 (60초 리센드 타이머)
 * Step 3: 추가 정보 입력 + 데이터 정책 3카드 + 동의 체크
 *
 * 실제 백엔드 인증 메일 발송은 BACKEND_ASKS.W4 의 후속 PR 이 머지될 때까지
 * Google OAuth 로 fallback — Step 1 의 "인증 메일 보내기" 가 도메인 매칭
 * 확인 후 Google OAuth(role=student) 로 이동, Google 응답이 돌아오면
 * /auth/complete-profile 에서 Step 3 의 추가 정보를 다시 수집한다.
 *
 * localStorage 미사용 — 모든 상태는 React state. sessionStorage 는 OAuth
 * 라운드트립 동안의 hint 한 건만 저장 (StudentEntry 와 동일 패턴).
 */
export interface SignupWizardProps {
  /** Google OAuth 후 돌아올 next URL (예: /v/[slug]). */
  next?: string;
}

const SCHOOL_DOMAINS: Record<string, string> = {
  "kgu.ac.kr": "경기대학교",
  "snu.ac.kr": "서울대학교",
  "korea.ac.kr": "고려대학교",
  "yonsei.ac.kr": "연세대학교",
  "kaist.ac.kr": "카이스트",
  "postech.ac.kr": "포항공대",
  "hanyang.ac.kr": "한양대학교",
  "skku.edu": "성균관대학교",
};
const ACADEMIC_DOMAIN = /\.(ac\.kr|edu)$/;

type EmailValidity = "empty" | "invalid-syntax" | "non-academic" | "valid";

interface EmailInfo {
  validity: EmailValidity;
  schoolName: string | null;
}

function inspectEmail(raw: string): EmailInfo {
  const v = raw.trim().toLowerCase();
  if (!v) return { validity: "empty", schoolName: null };
  const m = v.match(/^[^@\s]+@([^@\s]+)$/);
  if (!m) return { validity: "invalid-syntax", schoolName: null };
  const domain = m[1]!;
  if (!ACADEMIC_DOMAIN.test(domain)) {
    return { validity: "non-academic", schoolName: null };
  }
  const named = SCHOOL_DOMAINS[domain] ?? null;
  return { validity: "valid", schoolName: named };
}

const YEAR_OPTIONS = ["1", "2", "3", "4", "g"] as const;
type YearOption = (typeof YEAR_OPTIONS)[number];

const MAJOR_OPTIONS = [
  "중어중문학과",
  "국어국문학과",
  "영어영문학과",
  "일어일문학과",
  "사업경영학과",
  "광고홍보학과",
  "전자공학과",
  "컴퓨터과학과",
];

export default function SignupWizard({ next }: SignupWizardProps) {
  const { t } = useI18n();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [major, setMajor] = useState("");
  const [year, setYear] = useState<YearOption>("3");
  const [agree, setAgree] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(60);
  const [showSuccess, setShowSuccess] = useState(false);

  const emailInfo = useMemo<EmailInfo>(() => inspectEmail(email), [email]);
  const detectedSchool = emailInfo.schoolName;

  // Resend timer for Step 2 (60s).
  useEffect(() => {
    if (step !== 2) return;
    setResendSeconds(60);
    const id = window.setInterval(() => {
      setResendSeconds((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [step]);

  const goNext = () => setStep((s) => (s < 3 ? ((s + 1) as 1 | 2 | 3) : s));
  const goPrev = () => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s));

  const sendMail = () => {
    if (emailInfo.validity !== "valid") return;
    // 실제 메일 발송은 백엔드가 처리. 본 마법사는 OAuth 라운드트립을 위해
    // hint 만 sessionStorage 에 stash 한다.
    try {
      window.sessionStorage.setItem(
        "ifl_student_signup_hint",
        JSON.stringify({
          email: email.trim(),
          name: name.trim() || null,
          major: major.trim() || null,
          year: year || null,
          student_number: studentNumber.trim() || null,
          next: next || null,
        }),
      );
    } catch {
      /* ignore */
    }
    goNext();
  };

  const completeSignup = () => {
    if (!agree || redirecting) return;
    // 동의 시점에 sessionStorage 마지막 업데이트 후 OAuth.
    try {
      window.sessionStorage.setItem(
        "ifl_student_signup_hint",
        JSON.stringify({
          email: email.trim(),
          name: name.trim(),
          student_number: studentNumber.trim() || null,
          school: detectedSchool ?? null,
          major: major || null,
          year,
          next: next || null,
        }),
      );
    } catch {
      /* ignore */
    }
    setShowSuccess(true);
    setRedirecting(true);
    // 1.4초 후 toast 가 보이고 OAuth 라운드트립 시작 — UX 부드럽게.
    window.setTimeout(() => startGoogleLogin("student"), 1400);
  };

  const isStep3Valid =
    name.trim().length > 0 &&
    studentNumber.trim().length >= 4 &&
    !!major &&
    agree;

  return (
    <div className={styles.wrap}>
      {/* Back link */}
      <button
        type="button"
        className={`${styles.back} ${step === 1 ? styles.backHidden : ""}`}
        onClick={goPrev}
        aria-hidden={step === 1}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="11 18 5 12 11 6" />
        </svg>
        {t("student.signupV2.back")}
      </button>

      {/* Progress */}
      <div className={styles.progress}>
        <div
          className={styles.progressDots}
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={3}
          aria-valuenow={step}
        >
          {[1, 2, 3].map((i) => (
            <span
              key={i}
              className={`${styles.progressDot} ${
                i < step
                  ? styles.progressDotDone
                  : i === step
                    ? styles.progressDotCurrent
                    : ""
              }`}
            />
          ))}
        </div>
        <span className={styles.progressLabel}>
          <span className={styles.progressLabelNow}>{step}</span>
          {" / 3"}
        </span>
      </div>

      <div className={styles.stepCard}>
        {step === 1 && (
          <Step1
            email={email}
            setEmail={setEmail}
            info={emailInfo}
            onSend={sendMail}
          />
        )}
        {step === 2 && (
          <Step2
            email={email}
            resendSeconds={resendSeconds}
            onResendClick={() => setResendSeconds(60)}
            onDemoAdvance={goNext}
          />
        )}
        {step === 3 && (
          <Step3
            name={name}
            setName={setName}
            studentNumber={studentNumber}
            setStudentNumber={setStudentNumber}
            major={major}
            setMajor={setMajor}
            year={year}
            setYear={setYear}
            agree={agree}
            setAgree={setAgree}
            schoolName={detectedSchool ?? "—"}
            isValid={isStep3Valid}
            redirecting={redirecting}
            onSubmit={completeSignup}
          />
        )}
      </div>

      <div
        className={`${styles.toast} ${showSuccess ? styles.toastShow : ""}`}
        role="status"
        aria-live="polite"
      >
        <span className={styles.toastIcon} aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </span>
        {t("student.signupV2.step3.successToast")}
      </div>
    </div>
  );
}

/* ─────────── Step 1 ─────────── */

function Step1({
  email,
  setEmail,
  info,
  onSend,
}: {
  email: string;
  setEmail: (v: string) => void;
  info: EmailInfo;
  onSend: () => void;
}) {
  const { t } = useI18n();
  const wrapCls = `${styles.inputWrap} ${
    info.validity === "valid"
      ? styles.inputWrapValid
      : info.validity === "invalid-syntax" || info.validity === "non-academic"
        ? styles.inputWrapInvalid
        : ""
  }`;
  const hintCls = `${styles.fieldHint} ${
    info.validity === "valid"
      ? styles.fieldHintValid
      : info.validity === "invalid-syntax" || info.validity === "non-academic"
        ? styles.fieldHintInvalid
        : ""
  }`;
  const validText = info.schoolName
    ? t("student.signupV2.step1.hintValidWithSchool", { school: info.schoolName })
    : t("student.signupV2.step1.hintValidGeneric");

  return (
    <div className={styles.step}>
      <div className={styles.stepHead}>
        <h2>
          {t("student.signupV2.step1.headLine1")}
          <br />
          {t("student.signupV2.step1.headLine2")}
        </h2>
        <p>
          {t("student.signupV2.step1.subLine1")}
          <br />
          {t("student.signupV2.step1.subLine2")}
        </p>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="signup-email">
          {t("student.signupV2.step1.label")}
        </label>
        <div className={wrapCls}>
          <span className={styles.inputLead} aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m3 7 9 6 9-6" />
            </svg>
          </span>
          <input
            id="signup-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder={t("student.signupV2.step1.placeholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <span className={styles.inputTrail} aria-hidden="true">
            {info.validity === "valid" ? (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="#10B981"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="#EF4444"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            )}
          </span>
        </div>
        <div className={hintCls} role="status">
          {info.validity === "valid" ? (
            <>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>{validText}</span>
            </>
          ) : info.validity === "invalid-syntax" || info.validity === "non-academic" ? (
            <>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="13" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{t("student.signupV2.step1.hintInvalid")}</span>
            </>
          ) : (
            <span>{t("student.signupV2.step1.hintDefault")}</span>
          )}
        </div>
      </div>

      <div className={styles.stepActions}>
        <button
          type="button"
          className={`${tokens.btn} ${tokens.btnGold}`}
          disabled={info.validity !== "valid"}
          onClick={onSend}
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
            <path d="M22 2 11 13" />
            <path d="M22 2 15 22 11 13 2 9 22 2z" />
          </svg>
          {t("student.signupV2.step1.ctaSend")}
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
        <div className={styles.altLink}>
          <a href="/v/access-code">{t("student.signupV2.step1.altUseCode")}</a>
        </div>
      </div>
    </div>
  );
}

/* ─────────── Step 2 ─────────── */

function Step2({
  email,
  resendSeconds,
  onResendClick,
  onDemoAdvance,
}: {
  email: string;
  resendSeconds: number;
  onResendClick: () => void;
  onDemoAdvance: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className={styles.step}>
      <div className={styles.illust} aria-hidden="true">
        <span className={`${styles.floater} ${styles.floaterA}`} />
        <span className={`${styles.floater} ${styles.floaterB}`} />
        <span className={`${styles.floater} ${styles.floaterC}`} />
        <svg viewBox="0 0 48 48" fill="none">
          <defs>
            <linearGradient id="grad-envelope" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFB627" />
              <stop offset="100%" stopColor="#E89E0E" />
            </linearGradient>
            <linearGradient id="grad-envelope-flap" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFC74D" />
              <stop offset="100%" stopColor="#FFB627" />
            </linearGradient>
          </defs>
          <rect x="6" y="12" width="36" height="26" rx="4" fill="url(#grad-envelope)" />
          <path
            d="M6 16l18 12 18-12"
            stroke="#FFFCF3"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <path
            d="M6 16l18 12 18-12V14a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v2z"
            fill="url(#grad-envelope-flap)"
          />
          <circle cx="38" cy="12" r="5" fill="#10B981" stroke="#FFFCF3" strokeWidth="1.5" />
          <path
            d="M35.5 12l1.8 1.8 3.2-3.2"
            stroke="#FFFCF3"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </div>

      <div className={`${styles.stepHead} ${styles.stepHeadCentered}`}>
        <h2>{t("student.signupV2.step2.title")}</h2>
        <p>
          {t("student.signupV2.step2.sub").split("\n").map((line, i, arr) => (
            <span key={i}>
              {line}
              {i < arr.length - 1 && <br />}
            </span>
          ))}
        </p>
      </div>

      <div className={styles.emailPill}>
        <span className="dot" aria-hidden="true" />
        <span>{email || "name@school.edu"}</span>
      </div>

      <div className={styles.helperCard}>
        <div className={styles.helperIcon} aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="#0EA5E9"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <div className={styles.helperBody}>
          <span className={styles.helperTitle}>
            {t("student.signupV2.step2.helperTitle")}
          </span>
          <span className={styles.helperSub}>
            {t("student.signupV2.step2.helperSub")}
          </span>
        </div>
      </div>

      <div className={styles.resend}>
        <button type="button" disabled={resendSeconds > 0} onClick={onResendClick}>
          {t("student.signupV2.step2.resendBtn")}
        </button>
        {resendSeconds > 0 && (
          <span className={styles.resendTimer}>
            {t("student.signupV2.step2.resendTimer", { sec: String(resendSeconds) })}
          </span>
        )}
      </div>

      <button
        type="button"
        className={styles.demoAdvance}
        onClick={onDemoAdvance}
        aria-label={t("student.signupV2.step2.demoAdvance")}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
        {t("student.signupV2.step2.demoAdvance")}
      </button>
    </div>
  );
}

/* ─────────── Step 3 ─────────── */

function Step3({
  name,
  setName,
  studentNumber,
  setStudentNumber,
  major,
  setMajor,
  year,
  setYear,
  agree,
  setAgree,
  schoolName,
  isValid,
  redirecting,
  onSubmit,
}: {
  name: string;
  setName: (v: string) => void;
  studentNumber: string;
  setStudentNumber: (v: string) => void;
  major: string;
  setMajor: (v: string) => void;
  year: YearOption;
  setYear: (v: YearOption) => void;
  agree: boolean;
  setAgree: (v: boolean) => void;
  schoolName: string;
  isValid: boolean;
  redirecting: boolean;
  onSubmit: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className={styles.step}>
      <div className={styles.stepHead}>
        <h2>{t("student.signupV2.step3.title")}</h2>
        <p>{t("student.signupV2.step3.sub")}</p>
      </div>

      <div className={styles.formGrid}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="s3-name">
            {t("student.signupV2.step3.name")}
          </label>
          <div className={`${styles.inputWrap} ${styles.inputCompact}`}>
            <input
              id="s3-name"
              type="text"
              autoComplete="name"
              placeholder={t("student.signupV2.step3.namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="s3-sid">
            {t("student.signupV2.step3.studentNumber")}
          </label>
          <div className={`${styles.inputWrap} ${styles.inputCompact}`}>
            <input
              id="s3-sid"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder={t("student.signupV2.step3.studentNumberPlaceholder")}
              value={studentNumber}
              onChange={(e) => setStudentNumber(e.target.value.replace(/\D/g, "").slice(0, 12))}
            />
          </div>
        </div>

        <div className={`${styles.field} ${styles.fieldFull}`}>
          <label className={styles.fieldLabel} htmlFor="s3-school">
            {t("student.signupV2.step3.school")}
          </label>
          <div className={`${styles.inputWrap} ${styles.inputCompact} ${styles.inputLocked}`}>
            <span className={styles.inputLead} aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 21V8l9-5 9 5v13" />
                <path d="M9 21V12h6v9" />
              </svg>
            </span>
            <input
              id="s3-school"
              type="text"
              value={schoolName}
              readOnly
              aria-label={t("student.signupV2.step3.school")}
            />
            <span className={styles.autoTag}>{t("student.signupV2.step3.schoolAutoTag")}</span>
          </div>
        </div>

        <div className={`${styles.field} ${styles.fieldFull}`}>
          <label className={styles.fieldLabel} htmlFor="s3-major">
            {t("student.signupV2.step3.major")}
          </label>
          <div className={`${styles.inputWrap} ${styles.inputCompact} ${styles.hasChevron}`}>
            <span className={styles.inputLead} aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
            </span>
            <select
              id="s3-major"
              value={major}
              onChange={(e) => setMajor(e.target.value)}
            >
              <option value="">{t("student.signupV2.step3.majorPlaceholder")}</option>
              {MAJOR_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              <option value="기타">{t("student.signupV2.step3.majorOther")}</option>
            </select>
          </div>
        </div>

        <div className={`${styles.field} ${styles.fieldFull}`}>
          <span className={styles.fieldLabel}>
            {t("student.signupV2.step3.year")}
          </span>
          <div
            className={styles.radioGroup}
            role="radiogroup"
            aria-label={t("student.signupV2.step3.year")}
          >
            {YEAR_OPTIONS.map((y) => (
              <label key={y} className={styles.radioChip}>
                <input
                  type="radio"
                  name="year"
                  value={y}
                  checked={year === y}
                  onChange={() => setYear(y)}
                />
                {y === "g"
                  ? t("student.signupV2.step3.yearGrad")
                  : t("student.signupV2.step3.yearOption", { n: y })}
              </label>
            ))}
          </div>
        </div>
      </div>

      <PolicyBlock />

      <label className={styles.checkRow}>
        <input
          type="checkbox"
          checked={agree}
          onChange={(e) => setAgree(e.target.checked)}
        />
        <span className={styles.checkBox} aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </span>
        <span className={styles.checkText}>
          <span className={styles.checkTitle}>
            {t("student.signupV2.step3.agreeTitle")}
            <span className="req">{t("student.signupV2.step3.agreeRequired")}</span>
          </span>
          <span className={styles.checkSub}>{t("student.signupV2.step3.agreeSub")}</span>
        </span>
      </label>

      <div className={styles.stepActions}>
        <button
          type="button"
          className={`${tokens.btn} ${tokens.btnGold}`}
          disabled={!isValid || redirecting}
          onClick={onSubmit}
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
            <polyline points="20 6 9 17 4 12" />
          </svg>
          {redirecting
            ? t("student.signup.googleRedirecting")
            : t("student.signupV2.step3.submitBtn")}
        </button>
      </div>
    </div>
  );
}

function PolicyBlock() {
  const { t } = useI18n();
  return (
    <div className={styles.policyBlock}>
      <div className={styles.policyHead}>
        <span>{t("student.signupV2.step3.policyTitle")}</span>
        <span className={styles.policyHeadLine} />
      </div>
      <div className={styles.policyCards}>
        <div className={`${styles.policyCard} ${styles.policyViolet}`}>
          <div className={styles.policyIcon} aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="#6366F1"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          </div>
          <span className={styles.policyLabel}>
            {t("student.signupV2.step3.policyCollectLabel")}
          </span>
          <span className={styles.policyValue}>
            {t("student.signupV2.step3.policyCollectValue")}
          </span>
        </div>
        <div className={`${styles.policyCard} ${styles.policyCyan}`}>
          <div className={styles.policyIcon} aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="#0EA5E9"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </div>
          <span className={styles.policyLabel}>
            {t("student.signupV2.step3.policyReadLabel")}
          </span>
          <span className={styles.policyValue}>
            {t("student.signupV2.step3.policyReadValueA")}
            <span className="em">{t("student.signupV2.step3.policyReadValueEm")}</span>
          </span>
        </div>
        <div className={`${styles.policyCard} ${styles.policyAmber}`}>
          <div className={styles.policyIcon} aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="#E89E0E"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
            </svg>
          </div>
          <span className={styles.policyLabel}>
            {t("student.signupV2.step3.policyDeleteLabel")}
          </span>
          <span className={styles.policyValue}>
            <span className="em">{t("student.signupV2.step3.policyDeleteValueEm")}</span>
            {t("student.signupV2.step3.policyDeleteValueB")}
          </span>
        </div>
      </div>
    </div>
  );
}
