"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n, type Locale } from "@/contexts/I18nContext";
import { startGoogleLogin } from "@/lib/auth";

/**
 * Student-only sign-up surface (/auth/signup).
 *
 * The actual account creation happens in the existing Google OAuth flow:
 * Google → /api/auth/google → /api/auth/exchange → /auth/complete-profile.
 * This page collects optional pre-OAuth context (display name, preferred
 * locale, optional student number) for UX and validation, then hands off
 * to startGoogleLogin("student"). Locale changes are applied immediately
 * so the OAuth round-trip lands the user in the language they picked.
 *
 * Spec: docs/planning/06-student-pages.md §4 ("학생 회원가입 흐름").
 */

const STUDENT_NUMBER_PATTERN = /^[0-9]{4,12}$/;

interface FormErrors {
  name?: string;
  studentNumber?: string;
}

export default function SignupContent() {
  const { t, locale, setLocale } = useI18n();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "";

  const [name, setName] = useState("");
  const [pickedLocale, setPickedLocale] = useState<Locale>(locale);
  const [studentNumber, setStudentNumber] = useState("");
  const [touched, setTouched] = useState<{ name: boolean; studentNumber: boolean }>({
    name: false,
    studentNumber: false,
  });
  const [redirecting, setRedirecting] = useState(false);

  const errors: FormErrors = useMemo(() => {
    const out: FormErrors = {};
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      out.name = t("student.signup.validation.nameRequired");
    } else if (trimmed.length < 1) {
      // Defensive — collapsed-whitespace cases.
      out.name = t("student.signup.validation.nameTooShort");
    }
    if (studentNumber.trim().length > 0 && !STUDENT_NUMBER_PATTERN.test(studentNumber.trim())) {
      out.studentNumber = t("student.signup.validation.studentNumberFormat");
    }
    return out;
  }, [name, studentNumber, t]);

  const isValid = !errors.name && !errors.studentNumber;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Force-show all errors on submit so the user sees the issues even if
    // they never blurred a field.
    setTouched({ name: true, studentNumber: true });
    if (!isValid || redirecting) return;

    // Apply the locale choice before redirecting so the post-OAuth landing
    // (complete-profile / dashboard) renders in the user's picked language.
    if (pickedLocale !== locale) setLocale(pickedLocale);

    // We don't have a backend hook for the optional pre-OAuth fields yet,
    // but we stash them in sessionStorage so /auth/complete-profile can
    // surface defaults if it wants. See BACKEND_ASKS.W4.md.
    try {
      window.sessionStorage.setItem(
        "ifl_student_signup_hint",
        JSON.stringify({
          name: name.trim(),
          locale: pickedLocale,
          student_number: studentNumber.trim() || null,
          next: next || null,
        }),
      );
    } catch {
      /* ignore — non-fatal */
    }

    setRedirecting(true);
    startGoogleLogin("student");
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10 bg-gray-50">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500 text-black text-lg font-bold mb-4 select-none"
            aria-hidden="true"
          >
            🎓
          </div>
          <h1 className="text-xl font-bold text-gray-900">
            {t("student.signup.title")}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {t("student.signup.subtitle")}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8 space-y-5"
          noValidate
        >
          <Field
            id="signup-name"
            label={t("student.signup.name")}
            placeholder={t("student.signup.namePlaceholder")}
            value={name}
            onChange={setName}
            onBlur={() => setTouched((s) => ({ ...s, name: true }))}
            error={touched.name ? errors.name : undefined}
            required
            autoComplete="name"
          />

          <div>
            <label
              htmlFor="signup-locale"
              className="block text-sm font-medium text-gray-700 mb-1.5"
            >
              {t("student.signup.preferredLanguage")}
            </label>
            <select
              id="signup-locale"
              value={pickedLocale}
              onChange={(e) => setPickedLocale(e.target.value as Locale)}
              className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
            >
              <option value="ko">{t("language.ko")}</option>
              <option value="en">{t("language.en")}</option>
            </select>
          </div>

          <Field
            id="signup-student-number"
            label={t("student.signup.studentNumber")}
            placeholder={t("student.signup.studentNumberPlaceholder")}
            value={studentNumber}
            onChange={setStudentNumber}
            onBlur={() => setTouched((s) => ({ ...s, studentNumber: true }))}
            error={touched.studentNumber ? errors.studentNumber : undefined}
            inputMode="numeric"
            autoComplete="off"
          />

          <button
            type="submit"
            // Intentionally NOT `disabled={!isValid}` — pressing submit on an
            // invalid form is how the user sees the error messages (we toggle
            // `touched` inside handleSubmit). We only disable while the
            // OAuth redirect is in flight.
            disabled={redirecting}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-black shadow-sm transition hover:bg-amber-400 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {redirecting
              ? t("student.signup.googleRedirecting")
              : t("student.signup.googleCta")}
          </button>

          <p className="text-center text-xs text-gray-400">
            {t("student.signup.agreement")}
          </p>

          <p className="text-center text-xs text-gray-500 pt-2 border-t border-gray-100">
            {t("student.signup.alreadyHaveAccount")}{" "}
            <a
              href="/auth/login"
              className="text-amber-700 hover:underline font-medium"
            >
              {t("student.signup.loginLink")}
            </a>
          </p>

          <p className="text-center text-[11px] text-gray-400">
            {t("student.signup.noteOAuth")}
          </p>
        </form>
      </div>
    </main>
  );
}

function Field({
  id,
  label,
  placeholder,
  value,
  onChange,
  onBlur,
  error,
  required,
  inputMode,
  autoComplete,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  error?: string;
  required?: boolean;
  inputMode?: "numeric";
  autoComplete?: string;
}) {
  const errId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        id={id}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        inputMode={inputMode}
        autoComplete={autoComplete}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error ? errId : undefined}
        className={`w-full rounded-xl border px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:ring-2 focus:ring-amber-500/20 ${
          error
            ? "border-red-400 focus:border-red-500"
            : "border-gray-300 focus:border-amber-500"
        }`}
      />
      {error && (
        <p id={errId} role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
