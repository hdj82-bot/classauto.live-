"use client";

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { startGoogleLogin } from "@/lib/auth";

/**
 * 로그인 페이지 — v2 디자인 (라이트 베이지 #FAFAF7 + 골드 brand mark).
 *
 * 사용자 결정 2026-05-18:
 *   - v1 IFL 로고/`Interactive Flipped Learning` 헤더 블록 폐기.
 *   - 계정 유형 카드 이모지 제거 → SVG 라인 아이콘.
 *
 * 사용자 결정 2026-05-19:
 *   - 역할 카드를 베이지 배경과 구분되도록 컬러 분리:
 *     교수자 = 스카이 블루, 학습자 = 에메랄드. (기존 골드 단일톤은 배경과
 *     채도가 비슷해 선택 상태가 잘 안 보였음.)
 *   - 토글에 hover 시 솟아오르는 볼륨감(translateY + 섀도 강화, spring).
 *   - 아이콘 교체: 학습자 = 모니터, 교수자 = 학사모.
 *   - Google 버튼 문구에서 역할 고정 제거 → 단순 "Google 로그인".
 *
 * 디자인 토큰: globals.css 의 --gold / --font-display / --ease-spring.
 */
export default function LoginContent() {
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const errorKey = searchParams.get("error");
  const ERROR_KEYS: Record<string, string> = {
    invalid_state: "auth.errorInvalidState",
    google_failed: "auth.errorGoogleFailed",
    exchange_failed: "auth.errorExchangeFailed",
    role_denied: "auth.errorRoleDenied",
    invalid_invite: "auth.errorInvalidInvite",
  };
  const errorMsg = errorKey && ERROR_KEYS[errorKey] ? t(ERROR_KEYS[errorKey]) : null;

  // 로그인/회원가입은 같은 Google OAuth 흐름이지만 첫 방문자에게 "다시 오신 걸
  // 환영합니다"가 뜨지 않도록 ?mode=signup 으로 문구만 분기한다(신규 교수자 가입은
  // 백엔드 초대 게이트가 그대로 적용된다).
  const isSignup = searchParams.get("mode") === "signup";

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
      <div className="w-full max-w-md animate-fade-in-up">
        {/* Brand mark — LightMarketingShell 헤더와 동일한 골드 방패. */}
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
            {t(isSignup ? "auth.signupTitle" : "auth.loginTitle")}
          </h1>
          <p className="mt-1.5 text-sm text-[rgba(10,10,10,0.55)]">
            {t(isSignup ? "auth.signupSubtitle" : "auth.loginSubtitle")}
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

        {/* Card — 입체감: 베이지 위 흰 표면 + 레이어드 섀도 + 상단 하이라이트 */}
        <div
          className="rounded-3xl p-6 sm:p-8 space-y-7"
          style={{
            background: "linear-gradient(180deg, #FFFFFF 0%, #FCFBF6 100%)",
            border: "1px solid rgba(10,10,10,0.07)",
            boxShadow:
              "0 1px 2px rgba(10,10,10,0.04), 0 18px 40px -22px rgba(10,10,10,0.20), inset 0 1px 0 rgba(255,255,255,0.7)",
          }}
        >
          {/* Role selection — 교수자=스카이, 학습자=에메랄드. hover 볼륨감. */}
          <fieldset>
            <legend className="text-sm font-semibold text-[rgba(10,10,10,0.7)] mb-3">
              {t("auth.accountType")}
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <RoleButton
                tone="emerald"
                label={t("auth.studentLabel")}
                description={t("auth.studentDesc")}
                icon={<MonitorIcon />}
                selected={role === "student"}
                onClick={() => setRole("student")}
              />
              <RoleButton
                tone="sky"
                label={t("auth.professorLabel")}
                description={t("auth.professorDesc")}
                icon={<MortarboardIcon />}
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

          {/* Google login button — 역할 고정 문구 제거, 단순 "Google 로그인" */}
          <button
            onClick={handleGoogleLogin}
            disabled={isRedirecting}
            className="w-full flex items-center justify-center gap-3 rounded-2xl border border-[rgba(10,10,10,0.14)] bg-white px-4 py-3.5 text-sm font-semibold text-[rgba(10,10,10,0.78)] shadow-[0_1px_2px_rgba(10,10,10,0.05),inset_0_1px_0_rgba(255,255,255,0.6)] transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-[rgba(184,131,8,0.5)] hover:shadow-[0_10px_22px_-12px_rgba(184,131,8,0.45)] active:translate-y-0 active:scale-[0.985] disabled:opacity-60 disabled:cursor-not-allowed motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100"
          >
            {isRedirecting ? <Spinner /> : <GoogleIcon />}
            <span>
              {isRedirecting
                ? t("auth.googleRedirecting")
                : t(isSignup ? "auth.googleSignup" : "auth.googleLogin")}
            </span>
          </button>

          {/* 로그인 ↔ 회원가입 전환 — 같은 화면, 문구만 다름. */}
          <p className="text-center text-sm text-[rgba(10,10,10,0.55)]">
            {isSignup ? t("auth.haveAccount") : t("auth.noAccount")}{" "}
            <a
              href={isSignup ? "/auth/login" : "/auth/login?mode=signup"}
              className="font-semibold text-[#B88308] underline hover:text-[#946a07] transition-colors"
            >
              {isSignup ? t("auth.switchLogin") : t("auth.switchSignup")}
            </a>
          </p>

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

type Tone = "sky" | "emerald";

/** 역할별 컬러 세트 — 선택 표면/링/칩/라벨. 모두 Tailwind 클래스라
 *  hover 변형(translate/shadow)과 충돌하지 않는다. */
const TONE: Record<
  Tone,
  { selWrap: string; selChip: string; selLabel: string; idleChip: string }
> = {
  sky: {
    selWrap:
      "border-sky-400/70 bg-gradient-to-b from-sky-50 to-sky-100 ring-2 ring-sky-300/40 shadow-[0_14px_30px_-16px_rgba(2,132,199,0.55)]",
    selChip:
      "bg-gradient-to-br from-sky-400 to-sky-600 text-white shadow-[0_6px_14px_-7px_rgba(2,132,199,0.7),inset_0_1px_0_rgba(255,255,255,0.4)]",
    selLabel: "text-sky-800",
    idleChip:
      "bg-sky-500/10 text-sky-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]",
  },
  emerald: {
    selWrap:
      "border-emerald-400/70 bg-gradient-to-b from-emerald-50 to-emerald-100 ring-2 ring-emerald-300/40 shadow-[0_14px_30px_-16px_rgba(5,150,105,0.55)]",
    selChip:
      "bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-[0_6px_14px_-7px_rgba(5,150,105,0.7),inset_0_1px_0_rgba(255,255,255,0.4)]",
    selLabel: "text-emerald-800",
    idleChip:
      "bg-emerald-500/10 text-emerald-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]",
  },
};

function RoleButton({
  tone,
  label,
  description,
  icon,
  selected,
  onClick,
}: {
  tone: Tone;
  label: string;
  description: string;
  icon: ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  const c = TONE[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`group relative flex flex-col items-start gap-2.5 rounded-2xl border p-4 text-left will-change-transform transition-[transform,box-shadow,border-color,background-color] duration-200 ease-[var(--ease-spring,cubic-bezier(0.34,1.56,0.64,1))] hover:-translate-y-1 active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${
        selected
          ? `-translate-y-0.5 ${c.selWrap}`
          : "border-black/10 bg-white shadow-[0_1px_2px_rgba(10,10,10,0.04),inset_0_1px_0_rgba(255,255,255,0.6)] hover:border-black/20 hover:shadow-[0_12px_26px_-16px_rgba(10,10,10,0.4)]"
      }`}
    >
      <span
        aria-hidden="true"
        className={`flex items-center justify-center w-[38px] h-[38px] rounded-[11px] transition-transform duration-200 group-hover:scale-110 motion-reduce:transition-none motion-reduce:group-hover:scale-100 ${
          selected ? c.selChip : c.idleChip
        }`}
      >
        {icon}
      </span>
      <span
        className={`text-sm font-bold ${
          selected ? c.selLabel : "text-black/80"
        }`}
      >
        {label}
      </span>
      <span className="text-xs text-[rgba(10,10,10,0.45)]">{description}</span>
    </button>
  );
}

/* 학습자 — 모니터(디스플레이) 라인 아이콘. */
function MonitorIcon() {
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
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M9 20h6M12 16v4" />
    </svg>
  );
}

/* 교수자 — 학사모(mortarboard) 라인 아이콘. */
function MortarboardIcon() {
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
