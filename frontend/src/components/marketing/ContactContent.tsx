"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import LightMarketingShell from "./LightMarketingShell";
import FormField from "./FormField";
import { useMarketingI18n } from "./useMarketingI18n";
import { isFilled, isEmail, isNumericOrEmpty } from "./validation";

type Stage = "info" | "internal" | "decision" | "ready";
type Lms = "moodle" | "canvas" | "blackboard" | "klas" | "eclass" | "other";

interface FormState {
  organization: string;
  name: string;
  contactTitle: string;
  email: string;
  phone: string;
  stage: Stage | "";
  professorCount: string;
  studentCount: string;
  lms: Lms | "";
  callTime: string;
  message: string;
}

interface FormErrors {
  organization?: string;
  name?: string;
  contactTitle?: string;
  email?: string;
  phone?: string;
  stage?: string;
  professorCount?: string;
  studentCount?: string;
  lms?: string;
  callTime?: string;
}

const initialState: FormState = {
  organization: "",
  name: "",
  contactTitle: "",
  email: "",
  phone: "",
  stage: "",
  professorCount: "",
  studentCount: "",
  lms: "",
  callTime: "",
  message: "",
};

type Touched = Partial<Record<keyof FormState, boolean>>;

export default function ContactContent() {
  const { t } = useMarketingI18n();
  const [form, setForm] = useState<FormState>(initialState);
  const [touched, setTouched] = useState<Touched>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const errors: FormErrors = useMemo(() => {
    const e: FormErrors = {};
    const required = t("contact.validation.required");
    if (!isFilled(form.organization)) e.organization = required;
    if (!isFilled(form.name)) e.name = required;
    if (!isFilled(form.contactTitle)) e.contactTitle = required;
    if (!isFilled(form.email)) {
      e.email = required;
    } else if (!isEmail(form.email)) {
      e.email = t("contact.validation.emailFormat");
    }
    if (!isFilled(form.phone)) e.phone = required;
    if (!form.stage) e.stage = required;
    if (!isFilled(form.professorCount)) {
      e.professorCount = required;
    } else if (!isNumericOrEmpty(form.professorCount)) {
      e.professorCount = t("contact.validation.numberOnly");
    }
    if (!isFilled(form.studentCount)) {
      e.studentCount = required;
    } else if (!isNumericOrEmpty(form.studentCount)) {
      e.studentCount = t("contact.validation.numberOnly");
    }
    if (!form.lms) e.lms = required;
    if (!isFilled(form.callTime)) e.callTime = required;
    return e;
  }, [form, t]);

  const isValid = Object.keys(errors).length === 0;

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((s) => ({ ...s, [key]: value }));
  };

  const markTouched = (key: keyof FormState) =>
    setTouched((s) => ({ ...s, [key]: true }));

  const showError = (key: keyof FormErrors): string | undefined =>
    touched[key] ? errors[key] : undefined;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setTouched({
      organization: true,
      name: true,
      contactTitle: true,
      email: true,
      phone: true,
      stage: true,
      professorCount: true,
      studentCount: true,
      lms: true,
      callTime: true,
    });
    if (!isValid || submitting) return;

    setSubmitting(true);
    try {
      // No backend endpoint yet — see BACKEND_ASKS.R2W4.md.
      await new Promise((resolve) => setTimeout(resolve, 500));
      setSubmitted(true);
    } catch {
      setSubmitError(t("contact.errorBanner"));
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <LightMarketingShell>
        <section className="max-w-2xl mx-auto px-4 sm:px-6 py-24 text-center">
          <div
            className="mx-auto w-14 h-14 rounded-full flex items-center justify-center text-[#1A1A1A] text-2xl mb-6 font-bold"
            style={{
              background:
                "linear-gradient(135deg, #FFC74D 0%, #FFB627 100%)",
              boxShadow: "0 8px 24px rgba(255,182,39,0.30)",
            }}
            aria-hidden="true"
          >
            ✓
          </div>
          <h1
            className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0A0A0A]"
            style={{
              fontFamily:
                "var(--font-display, 'Paperlogy'), 'Pretendard Variable', sans-serif",
              letterSpacing: "-0.025em",
            }}
          >
            {t("contact.successTitle")}
          </h1>
          <p className="mt-4 text-[rgba(10,10,10,0.72)] leading-relaxed whitespace-pre-line">
            {t("contact.successBody")}
          </p>
          <div className="mt-8">
            <Link
              href="/"
              className="inline-flex justify-center rounded-xl border border-[rgba(10,10,10,0.16)] px-5 py-2.5 text-sm text-[#0A0A0A] hover:bg-black/5 transition motion-reduce:transition-none"
            >
              {t("common.backToHome")}
            </Link>
          </div>
        </section>
      </LightMarketingShell>
    );
  }

  return (
    <LightMarketingShell>
      <section className="max-w-2xl mx-auto px-4 sm:px-6 pt-20 sm:pt-28 pb-10 text-center">
        <p className="text-[11px] sm:text-xs font-semibold tracking-[0.22em] text-[#B88308] uppercase mb-5">
          {t("contact.hero.eyebrow")}
        </p>
        <h1
          className="text-[#0A0A0A] tracking-tight leading-[1.08]"
          style={{
            fontFamily:
              "var(--font-display, 'Paperlogy'), 'Pretendard Variable', sans-serif",
            fontSize: "clamp(32px, 5vw, 56px)",
            fontWeight: 800,
            letterSpacing: "-0.035em",
          }}
        >
          {t("contact.hero.title")}
        </h1>
        <p className="mt-5 text-base sm:text-lg text-[rgba(10,10,10,0.62)] max-w-xl mx-auto leading-relaxed">
          {t("contact.hero.subtitle")}
        </p>
      </section>

      <section className="max-w-2xl mx-auto px-4 sm:px-6 pb-24">
        <div
          className="mb-6 rounded-xl border border-[rgba(184,131,8,0.30)] bg-[rgba(255,182,39,0.06)] px-4 py-3 text-xs text-[#7A5500] leading-relaxed"
          role="note"
        >
          {t("contact.mockNotice")}
        </div>

        {submitError && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-3 text-sm text-[#DC2626]"
          >
            {submitError}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          noValidate
          className="space-y-5 rounded-2xl border border-[rgba(10,10,10,0.08)] bg-white p-6 sm:p-8 shadow-[0_4px_16px_rgba(10,10,10,0.04)]"
        >
          <FormField
            label={t("contact.fields.organization")}
            placeholder={t("contact.fields.organizationPlaceholder")}
            value={form.organization}
            onChange={(v) => setField("organization", v)}
            onBlur={() => markTouched("organization")}
            error={showError("organization")}
            required
            autoComplete="organization"
          />
          <FormField
            label={t("contact.fields.name")}
            placeholder={t("contact.fields.namePlaceholder")}
            value={form.name}
            onChange={(v) => setField("name", v)}
            onBlur={() => markTouched("name")}
            error={showError("name")}
            required
            autoComplete="name"
          />
          <FormField
            label={t("contact.fields.title")}
            placeholder={t("contact.fields.titlePlaceholder")}
            value={form.contactTitle}
            onChange={(v) => setField("contactTitle", v)}
            onBlur={() => markTouched("contactTitle")}
            error={showError("contactTitle")}
            required
          />
          <FormField
            label={t("contact.fields.email")}
            placeholder={t("contact.fields.emailPlaceholder")}
            value={form.email}
            onChange={(v) => setField("email", v)}
            onBlur={() => markTouched("email")}
            error={showError("email")}
            required
            type="email"
            autoComplete="email"
            inputMode="email"
          />
          <FormField
            label={t("contact.fields.phone")}
            placeholder={t("contact.fields.phonePlaceholder")}
            value={form.phone}
            onChange={(v) => setField("phone", v)}
            onBlur={() => markTouched("phone")}
            error={showError("phone")}
            required
            type="tel"
            autoComplete="tel"
            inputMode="tel"
          />
          <FormField
            variant="select"
            label={t("contact.fields.stage")}
            value={form.stage}
            onChange={(v) => setField("stage", v as Stage | "")}
            onBlur={() => markTouched("stage")}
            error={showError("stage")}
            required
            options={[
              { value: "info", label: t("contact.fields.stageOptions.info") },
              {
                value: "internal",
                label: t("contact.fields.stageOptions.internal"),
              },
              {
                value: "decision",
                label: t("contact.fields.stageOptions.decision"),
              },
              { value: "ready", label: t("contact.fields.stageOptions.ready") },
            ]}
          />
          <FormField
            label={t("contact.fields.professorCount")}
            placeholder={t("contact.fields.professorCountPlaceholder")}
            value={form.professorCount}
            onChange={(v) => setField("professorCount", v)}
            onBlur={() => markTouched("professorCount")}
            error={showError("professorCount")}
            required
            inputMode="numeric"
          />
          <FormField
            label={t("contact.fields.studentCount")}
            placeholder={t("contact.fields.studentCountPlaceholder")}
            value={form.studentCount}
            onChange={(v) => setField("studentCount", v)}
            onBlur={() => markTouched("studentCount")}
            error={showError("studentCount")}
            required
            inputMode="numeric"
          />
          <FormField
            variant="select"
            label={t("contact.fields.lms")}
            value={form.lms}
            onChange={(v) => setField("lms", v as Lms | "")}
            onBlur={() => markTouched("lms")}
            error={showError("lms")}
            required
            options={[
              { value: "moodle", label: t("contact.fields.lmsOptions.moodle") },
              { value: "canvas", label: t("contact.fields.lmsOptions.canvas") },
              {
                value: "blackboard",
                label: t("contact.fields.lmsOptions.blackboard"),
              },
              { value: "klas", label: t("contact.fields.lmsOptions.klas") },
              { value: "eclass", label: t("contact.fields.lmsOptions.eclass") },
              { value: "other", label: t("contact.fields.lmsOptions.other") },
            ]}
          />
          <FormField
            label={t("contact.fields.callTime")}
            placeholder={t("contact.fields.callTimePlaceholder")}
            value={form.callTime}
            onChange={(v) => setField("callTime", v)}
            onBlur={() => markTouched("callTime")}
            error={showError("callTime")}
            required
          />
          <FormField
            variant="textarea"
            label={t("contact.fields.message")}
            placeholder={t("contact.fields.messagePlaceholder")}
            value={form.message}
            onChange={(v) => setField("message", v)}
            rows={5}
          />

          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl px-5 py-3 text-sm font-semibold text-[#1A1A1A] transition motion-reduce:transition-none disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: submitting
                  ? "#E89E0B"
                  : "linear-gradient(135deg, #FFC74D 0%, #FFB627 50%, #E89E0B 100%)",
                boxShadow: "0 8px 24px rgba(255,182,39,0.30)",
              }}
            >
              {submitting
                ? t("contact.submittingButton")
                : t("contact.submitButton")}
            </button>
            <p className="mt-3 text-center text-xs text-[rgba(10,10,10,0.45)]">
              {t("contact.footerNote")}
            </p>
          </div>
        </form>
      </section>
    </LightMarketingShell>
  );
}
