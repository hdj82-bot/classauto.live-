"use client";

import { useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { startGoogleLogin } from "@/lib/auth";

/**
 * Two-button CTA block for unauthenticated visitors landing on /v/[slug].
 * Per docs/planning/06-student-pages.md §3.1 the primary action is "school
 * Google sign-in" and the secondary is the dedicated student sign-up flow.
 *
 * `signupHref` is configurable so we can route to /auth/signup?from=/v/[slug]
 * and bring the visitor back here after they finish OAuth.
 */
export default function EntryCTA({
  signupHref = "/auth/signup",
}: {
  signupHref?: string;
}) {
  const { t } = useI18n();
  const [redirecting, setRedirecting] = useState(false);

  const handleGoogle = () => {
    if (redirecting) return;
    setRedirecting(true);
    startGoogleLogin("student");
  };

  return (
    <section
      aria-label="entry-cta"
      className="rounded-2xl border border-gray-800 bg-gray-900/60 p-6 sm:p-8 space-y-4"
    >
      <p className="text-sm text-gray-300">{t("student.entry.watchToProceed")}</p>

      <button
        type="button"
        onClick={handleGoogle}
        disabled={redirecting}
        className="w-full flex items-center justify-center gap-3 rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-black shadow-sm transition hover:bg-amber-400 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <GoogleIcon />
        {redirecting ? t("auth.googleRedirecting") : t("student.entry.loginCta")}
      </button>

      <a
        href={signupHref}
        className="w-full flex items-center justify-center rounded-xl border border-gray-700 bg-transparent px-4 py-3 text-sm font-medium text-gray-200 hover:bg-gray-800 transition"
      >
        {t("student.entry.signupCta")}
      </a>

      <p className="text-xs text-gray-500 leading-relaxed pt-2 border-t border-gray-800">
        {t("student.entry.guestNotice")}{" "}
        <a href="/privacy" className="underline hover:text-gray-300">
          {t("student.entry.privacyLink")}
        </a>
      </p>
    </section>
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
