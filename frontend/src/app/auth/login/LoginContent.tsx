"use client";

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { startGoogleLogin } from "@/lib/auth";

/**
 * 로그인 페이지 — v2 디자인 (라이트 베이지 #FAFAF7 + 골드).
 *
 * 사용자 결정 2026-05-18:
 *   - v1 IFL 로고/`Interactive Flipped Learning` 헤더 블록 폐기.
 *     사이트 정체성은 ClassAuto. 상단은 골드 방패 brand mark 로 통일
 *     (LightMarketingShell 헤더와 동일 규격).
 *   - 계정 유형 카드의 이모지(🎓/📚) 제거 → 그라데이션 SVG 라인 아이콘.
 *   - 카드에 입체감(레이어드 섀도 + 그라데이션 표면 + 선택 시 골드 글로우).
 *
 * 디자인 토큰: globals.css 의 --gold(#FFB627) / --gold-on-light(#B88308) /
 * --font-display(Paperlogy) / --ease-spring. 직접 폰트명·임의 색 박지 않음.
 */
export default function LoginContent() {
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const errorKey = searchParams.get("error");
  const errorMsg = errorKey === "invalid_state"
    ? t("auth.errorInvalidState")
    : errorKey === "google_failed"
      ? t("auth.errorGoogleFailed")
      : null;

  const [role, setRole] = useState<"professor" | "student">("student");
  const [isRedirecting, setIsRedirecting] = useState(false);

  const handleGoogleLogin = () => {
    setIsRedirecting(true);
    // helper 가 URL 빌더 + same-origin 검증 + OAuth state 발급 + redirect 까지 처리.
    startGoogleLogin(role);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12 antialiased"
      style={{
        backgroundColor: "#FAFAF7",
        backgroundImage:
          "radial-gradient(120% 80% at 50% -10%, rgba(255,182,39,0.10) 0%, rgba(250,250,247,0) 60%)",
        fontFamily:
          "var(--font-body, 'Pretendard Variable'), 'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
        color: "#0A0A0A",
      }}
    >
      {/* 그라데이션 SVG 아이콘이 공유하는 stroke 그라데이션 정의 (한 번만 렌더) */}
      <svg width="0" height="0" aria-hidden="true" className="absolute">
        <defs>
          <linearGradient id="login-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFC74D" />
            <stop offset="100%" stopColor="#B88308" />
          </linearGradient>
        </defs>
      </svg>

      <div className="w-full max-w-md animate-fade-in-up">
        {/* Brand mark — LightMarketingShell 헤더와 동일한 28px 골드 방패 규격을
            로그인 페이지용으로 44px 로 키운 버전. IFL 잔재 완전 제거. */}
        <div className="text-center mb-9">
          <span
            aria-hidden="true"
            className="inline-flex items-center justify-center text-white mb-5"
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "12px",
              background: "linear-gradient(135deg, #FFC74D, #E89E0E)",
              boxShadow:
                "0 8px 20px -8px rgba(184,131,8,0.55), inset 0 1px 0 rgba(255,255,255,0.45)",
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              width="24"
              height="24"
            >
              <path d="M5 6.5l7-3 7 3v6c0 4-3 6.7-7 8.5-4-1.8-7-4.5-7-8.5v-6z" />
              <path d="M9 11.5l2.2 2.2L15 9.5" />
            </svg>
          </span>
          <h1
            className="text-2xl font-extrabold tracking-tight"
            style={{
              fontFamily:
                "var(--font-display, 'Paperlogy'), 'Pretendard Variable', sans-serif",
            }}
          >
            {t("auth.loginTitle")}
          </h1>
          <p className="mt-1.5 text-sm text-[rgba(10,10,10,0.55)]">
            {t("auth.loginSubtitle")}
          </p>
        </div>

        {/* Error */}
        {errorMsg && (
          <div
            role="alert"
            className="mb-6 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
          >
            {errorMsg}
          </div>
        )}

        {/* Card — 입체감: 베이지 위 흰 표면 + 레이어드 섀도 + 미세 상단 하이라이트 */}
        <div
          className="rounded-3xl p-6 sm:p-8 space-y-7"
          style={{
            background: "linear-gradient(180deg, #FFFFFF 0%, #FCFBF6 100%)",
            border: "1px solid rgba(10,10,10,0.07)",
            boxShadow:
              "0 1px 2px rgba(10,10,10,0.04), 0 18px 40px -22px rgba(10,10,10,0.20), inset 0 1px 0 rgba(255,255,255,0.7)",
          }}
        >
          {/* Role selection — 이모지 제거, 그라데이션 라인 아이콘 + 입체 카드 */}
          <fieldset>
            <legend className="text-sm font-semibold text-[rgba(10,10,10,0.7)] mb-3">
              {t("auth.accountType")}
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <RoleButton
                label={t("auth.studentLabel")}
                description={t("auth.studentDesc")}
                icon={<StudentIcon />}
                selected={role === "student"}
                onClick={() => setRole("student")}
              />
              <RoleButton
                label={t("auth.professorLabel")}
                description={t("auth.professorDesc")}
                icon={<ProfessorIcon />}
                selected={role === "professor"}
                onClick={() => setRole("professor")}
              />
            </div>
          </fieldset>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-[rgba(10,10,10,0.08)]" />
            </div>
            <div className="relative flex justify-center text-xs text-[rgba(10,10,10,0.4)]">
              <span className="bg-white px-3">{t("auth.socialLogin")}</span>
            </div>
          </div>

          {/* Google login button */}
          <button
            onClick={handleGoogleLogin}
            disabled={isRedirecting}
            className="w-full flex items-center justify-center gap-3 rounded-2xl border border-[rgba(10,10,10,0.14)] bg-white px-4 py-3.5 text-sm font-semibold text-[rgba(10,10,10,0.78)] transition-[transform,box-shadow,border-color] duration-200 hover:border-[rgba(184,131,8,0.5)] hover:shadow-[0_8px_20px_-12px_rgba(184,131,8,0.4)] active:scale-[0.985] disabled:opacity-60 disabled:cursor-not-allowed motion-reduce:transition-none motion-reduce:active:scale-100"
            style={{
              boxShadow:
                "0 1px 2px rgba(10,10,10,0.05), inset 0 1px 0 rgba(255,255,255,0.6)",
            }}
          >
            {isRedirecting ? <Spinner /> : <GoogleIcon />}
            <span>
              {isRedirecting
                ? t("auth.googleRedirecting")
                : t("auth.loginAs", {
                    role:
                      role === "professor"
                        ? t("common.professor")
                        : t("common.student"),
                  })}
            </span>
          </button>

          <p className="text-center text-xs text-[rgba(10,10,10,0.4)]">
            {t("auth.agreeTerms")}{" "}
            <a href="/terms" className="underline hover:text-[#B88308] transition-colors">
              {t("auth.terms")}
            </a>{" "}
            &amp;{" "}
            <a href="/privacy" className="underline hover:text-[#B88308] transition-colors">
              {t("auth.privacy")}
            </a>
            {t("auth.agreeTermsSuffix")}
          </p>
        </div>
      </div>
    </div>
  );
}

function RoleButton({
  label,
  description,
  icon,
  selected,
  onClick,
}: {
  label: string;
  description: string;
  icon: ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="group relative flex flex-col items-start gap-2.5 rounded-2xl p-4 text-left transition-[transform,box-shadow,border-color,background] duration-200 ease-[var(--ease-spring,cubic-bezier(0.34,1.56,0.64,1))] motion-reduce:transition-none"
      style={
        selected
          ? {
              background:
                "linear-gradient(180deg, #FFFDF4 0%, #FDF1D4 100%)",
              border: "1px solid rgba(184,131,8,0.55)",
              boxShadow:
                "0 0 0 3px rgba(255,182,39,0.18), 0 12px 26px -14px rgba(184,131,8,0.5), inset 0 1px 0 rgba(255,255,255,0.7)",
              transform: "translateY(-1px)",
            }
          : {
              background:
                "linear-gradient(180deg, #FFFFFF 0%, #FAF8F2 100%)",
              border: "1px solid rgba(10,10,10,0.08)",
              boxShadow:
                "0 1px 2px rgba(10,10,10,0.04), inset 0 1px 0 rgba(255,255,255,0.6)",
            }
      }
    >
      <span
        aria-hidden="true"
        className="flex items-center justify-center transition-transform duration-200 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        style={{
          width: "38px",
          height: "38px",
          borderRadius: "11px",
          background: selected
            ? "linear-gradient(135deg, #FFC74D, #E89E0E)"
            : "rgba(255,182,39,0.12)",
          boxShadow: selected
            ? "0 6px 14px -7px rgba(184,131,8,0.6), inset 0 1px 0 rgba(255,255,255,0.4)"
            : "inset 0 1px 0 rgba(255,255,255,0.5)",
          color: selected ? "#FFFFFF" : "#B88308",
        }}
      >
        {icon}
      </span>
      <span
        className="text-sm font-bold"
        style={{ color: selected ? "#7A5705" : "rgba(10,10,10,0.82)" }}
      >
        {label}
      </span>
      <span className="text-xs text-[rgba(10,10,10,0.45)]">{description}</span>
    </button>
  );
}

/* 학습자 — mortarboard(학사모) 라인 아이콘. selected 시 흰색, 평시 골드. */
function StudentIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.5 9 12 4.5 21.5 9 12 13.5 2.5 9z" />
      <path d="M6.5 11v4.2c0 .9 2.5 2.3 5.5 2.3s5.5-1.4 5.5-2.3V11" />
      <path d="M21.5 9v4.5" />
    </svg>
  );
}

/* 교수자 — 강의/발표 보드 라인 아이콘. */
function ProfessorIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3.5" width="18" height="12.5" rx="2" />
      <path d="M7 8h7M7 11.5h5" />
      <path d="M12 16v4M8.5 21h7" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853" />
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin w-4 h-4 text-[#B88308]"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}
