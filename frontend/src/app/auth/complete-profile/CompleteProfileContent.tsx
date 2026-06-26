"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { authApi } from "@/lib/api";
import { useI18n } from "@/contexts/I18nContext";
import StudentSurfaceLight from "@/components/student/v2/StudentSurfaceLight";
import tokens from "@/components/student/v2/tokens-v2.module.css";
import styles from "@/components/student/v2/SignupV2.module.css";

/**
 * /auth/complete-profile — Google OAuth 후 학생/교수자가 추가 정보를 입력하는
 * 페이지 (v2).
 *
 * - 라이트 톤 (영상 없음 = 라이트, colors.md §1).
 * - 단일 카드 안에 Google 계정 칩 + 폼 필드 + CTA.
 * - 학생: 학번
 *   교수자: 학교 + 학과
 *
 * (창 2 의 OAuth 콜백 → 본 페이지 → 토큰 발급 → dashboard 흐름은 그대로 유지)
 */
type ExchangedProfile = {
  tempToken: string;
  email: string;
  name: string;
  role: "professor" | "student";
};

export default function CompleteProfileContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { login } = useAuth();
  const { t } = useI18n();

  const [profile, setProfile] = useState<ExchangedProfile | null>(null);
  const [school, setSchool] = useState("");
  const [department, setDepartment] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  // G(스펙 13): 교수자 베타 모니터링 동의. 미동의면 가입 불가(백엔드 422). 학생 무관.
  const [betaConsented, setBetaConsented] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const exchangedRef = useRef(false);

  // temp_code 는 1회용 — StrictMode 재실행으로 두 번째 호출이 401 나는 것을 막는다.
  useEffect(() => {
    if (exchangedRef.current) return;
    const tempCode = searchParams.get("temp_code");
    if (!tempCode) {
      router.replace("/auth/login?error=invalid_state");
      return;
    }
    exchangedRef.current = true;
    (async () => {
      try {
        const { data } = await authApi.tempExchange(tempCode);
        setProfile({
          tempToken: data.temp_token,
          email: data.email,
          name: data.name,
          role: data.role,
        });
      } catch {
        router.replace("/auth/login?error=exchange_failed");
      }
    })();
  }, [searchParams, router]);

  if (!profile) {
    return (
      <StudentSurfaceLight bare>
        <div
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            color: "rgba(10, 10, 10, 0.55)",
            fontSize: "14px",
          }}
        >
          <p role="status">{t("student.completeProfileV2.loading")}</p>
        </div>
      </StudentSurfaceLight>
    );
  }

  const { tempToken, email, name, role } = profile;
  const isStudent = role === "student";
  // 교수자는 베타 모니터링 동의가 필수(G). 학생은 무관.
  const consentOk = isStudent || betaConsented;
  const isValid =
    (isStudent
      ? studentNumber.trim().length >= 4
      : school.trim().length > 0 && department.trim().length > 0) && consentOk;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;
    setIsSubmitting(true);
    setError("");
    try {
      const { data } = await authApi.completeProfile({
        temp_token: tempToken,
        ...(isStudent
          ? { student_number: studentNumber.trim() }
          : {
              school: school.trim(),
              department: department.trim(),
              beta_consented: betaConsented,
            }),
      });
      login(data.access_token);
      // 역할별 착지: 교수자는 교수자 대시보드, 학생은 학생 대시보드.
      router.replace(role === "professor" ? "/professor/dashboard" : "/dashboard");
    } catch {
      setError(t("student.completeProfileV2.error"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const initial = (name || email || "?").trim().charAt(0).toUpperCase();

  return (
    <StudentSurfaceLight>
      <div className={styles.wrap}>
        <div className={styles.stepCard}>
          <div className={styles.stepHead}>
            <h2>{t("student.completeProfileV2.title")}</h2>
            <p>
              {isStudent
                ? t("student.completeProfileV2.subtitleStudent")
                : t("student.completeProfileV2.subtitleProfessor")}
            </p>
          </div>

          <div
            className={styles.accountChip}
            aria-label={t("student.completeProfileV2.googleAccountLabel")}
          >
            <div className={styles.accountAvatar} aria-hidden="true">
              {initial}
            </div>
            <div className={styles.accountBody}>
              <div className={styles.accountName}>{name}</div>
              <div className={styles.accountEmail}>{email}</div>
            </div>
            <span className={styles.accountBadge}>
              {isStudent
                ? t("student.completeProfileV2.studentBadge")
                : t("student.completeProfileV2.professorBadge")}
            </span>
          </div>

          {error && (
            <div className={styles.errorBanner} role="alert">
              {error}
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            style={{ display: "flex", flexDirection: "column", gap: 16 }}
          >
            {isStudent ? (
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="cp-sid">
                  {t("student.completeProfileV2.studentNumber")}
                </label>
                <div className={`${styles.inputWrap} ${styles.inputCompact}`}>
                  <input
                    id="cp-sid"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={t("student.completeProfileV2.studentNumberPlaceholder")}
                    value={studentNumber}
                    onChange={(e) =>
                      setStudentNumber(e.target.value.replace(/\D/g, "").slice(0, 12))
                    }
                  />
                </div>
              </div>
            ) : (
              <>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="cp-school">
                    {t("student.completeProfileV2.school")}
                  </label>
                  <div className={`${styles.inputWrap} ${styles.inputCompact}`}>
                    <input
                      id="cp-school"
                      type="text"
                      autoComplete="organization"
                      placeholder={t("student.completeProfileV2.schoolPlaceholder")}
                      value={school}
                      onChange={(e) => setSchool(e.target.value)}
                    />
                  </div>
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="cp-dept">
                    {t("student.completeProfileV2.department")}
                  </label>
                  <div className={`${styles.inputWrap} ${styles.inputCompact}`}>
                    <input
                      id="cp-dept"
                      type="text"
                      autoComplete="organization-title"
                      placeholder={t("student.completeProfileV2.departmentPlaceholder")}
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                    />
                  </div>
                </div>

                {/* G(스펙 13): 베타 모니터링 동의 — 교수자만, 미동의 시 가입 불가. */}
                <label
                  htmlFor="cp-consent"
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "1px solid rgba(10, 10, 10, 0.12)",
                    background: "rgba(10, 10, 10, 0.02)",
                    cursor: "pointer",
                  }}
                >
                  <input
                    id="cp-consent"
                    type="checkbox"
                    checked={betaConsented}
                    onChange={(e) => setBetaConsented(e.target.checked)}
                    style={{
                      marginTop: 2,
                      width: 18,
                      height: 18,
                      accentColor: "#B88308",
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      fontSize: 13,
                      lineHeight: 1.5,
                      color: "rgba(10, 10, 10, 0.7)",
                    }}
                  >
                    <strong style={{ color: "rgba(10, 10, 10, 0.9)", fontWeight: 600 }}>
                      {t("student.completeProfileV2.betaConsentLabel")}
                    </strong>
                    {t("student.completeProfileV2.betaConsentNotice")}
                  </span>
                </label>
              </>
            )}

            <button
              type="submit"
              className={`${tokens.btn} ${tokens.btnGold}`}
              disabled={!isValid || isSubmitting}
            >
              {isSubmitting
                ? t("student.completeProfileV2.submitting")
                : t("student.completeProfileV2.submit")}
            </button>
          </form>
        </div>
      </div>
    </StudentSurfaceLight>
  );
}
