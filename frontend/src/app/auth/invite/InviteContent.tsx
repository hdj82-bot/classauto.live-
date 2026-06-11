"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/contexts/I18nContext";
import { authApi } from "@/lib/api";
import { startGoogleLogin } from "@/lib/auth";

type InviteState =
  | { kind: "loading" }
  | { kind: "active"; email: string }
  | { kind: "invalid" }
  | { kind: "used" }
  | { kind: "expired" };

/**
 * /auth/invite?token=… — 교수자 초대 랜딩.
 *
 * 계정주가 보낸 초대 링크의 진입점. 토큰으로 초대 대상 이메일·상태를 조회해
 * 보여주고, 유효하면 그 이메일의 Google 계정으로 교수자 가입을 시작한다
 * (startGoogleLogin("professor", token) → 백엔드가 가입 시 초대를 검증·소비).
 *
 * 로그인 페이지와 동일한 라이트 베이지 + 골드 톤.
 */
export default function InviteContent() {
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const token = searchParams.get("token") ?? "";
  // 토큰이 없으면 초기 상태부터 invalid — 이펙트 안에서 동기 setState 를 피한다
  // (react-hooks/set-state-in-effect). 토큰이 있으면 로딩으로 시작해 조회한다.
  const [state, setState] = useState<InviteState>(() =>
    token ? { kind: "loading" } : { kind: "invalid" },
  );
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await authApi.inviteInfo(token);
        if (cancelled) return;
        if (data.status === "used") setState({ kind: "used" });
        else if (data.status === "expired") setState({ kind: "expired" });
        else setState({ kind: "active", email: data.email });
      } catch {
        if (!cancelled) setState({ kind: "invalid" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSignup = () => {
    setIsRedirecting(true);
    startGoogleLogin("professor", token);
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
            {t("auth.invite.title")}
          </h1>
        </div>

        <div
          className="rounded-3xl p-6 sm:p-8"
          style={{
            background: "linear-gradient(180deg, #FFFFFF 0%, #FCFBF6 100%)",
            border: "1px solid rgba(10,10,10,0.07)",
            boxShadow:
              "0 1px 2px rgba(10,10,10,0.04), 0 18px 40px -22px rgba(10,10,10,0.20), inset 0 1px 0 rgba(255,255,255,0.7)",
          }}
        >
          {state.kind === "loading" && (
            <p
              role="status"
              className="text-center text-sm"
              style={{ color: "rgba(10,10,10,0.55)" }}
            >
              {t("auth.invite.loading")}
            </p>
          )}

          {state.kind === "active" && (
            <div className="space-y-6">
              <p className="text-sm" style={{ color: "rgba(10,10,10,0.7)" }}>
                {t("auth.invite.subtitle", { email: state.email })}
              </p>
              <button
                onClick={handleSignup}
                disabled={isRedirecting}
                className="w-full flex items-center justify-center gap-3 rounded-2xl border border-[rgba(10,10,10,0.14)] bg-white px-4 py-3.5 text-sm font-semibold text-[rgba(10,10,10,0.78)] shadow-[0_1px_2px_rgba(10,10,10,0.05),inset_0_1px_0_rgba(255,255,255,0.6)] transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-[rgba(184,131,8,0.5)] hover:shadow-[0_10px_22px_-12px_rgba(184,131,8,0.45)] active:translate-y-0 active:scale-[0.985] disabled:opacity-60 disabled:cursor-not-allowed motion-reduce:transition-none"
              >
                <GoogleIcon />
                <span>
                  {isRedirecting
                    ? t("auth.googleRedirecting")
                    : t("auth.invite.cta")}
                </span>
              </button>
              <p
                className="text-xs"
                style={{ color: "rgba(10,10,10,0.45)", lineHeight: 1.6 }}
              >
                {t("auth.invite.emailNote", { email: state.email })}
              </p>
            </div>
          )}

          {state.kind !== "loading" && state.kind !== "active" && (
            <div className="text-center space-y-3">
              <h2 className="text-base font-bold" style={{ color: "#0A0A0A" }}>
                {t(`auth.invite.${state.kind}Title`)}
              </h2>
              <p className="text-sm" style={{ color: "rgba(10,10,10,0.55)" }}>
                {t(`auth.invite.${state.kind}Body`)}
              </p>
              <a
                href="/auth/login"
                className="inline-block mt-2 text-sm font-semibold underline"
                style={{ color: "#B88308" }}
              >
                {t("auth.invite.toLogin")}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
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
