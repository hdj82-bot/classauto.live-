"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import MarketingShell from "./MarketingShell";
import SectionHeader from "./SectionHeader";
import FormField from "./FormField";
import { useMarketingI18n } from "./useMarketingI18n";
import {
  isFilled,
  isEmail,
  looksLikeSchoolEmail,
  isNumericOrEmpty,
} from "./validation";

type StartTiming = "now" | "nextSemester" | "undecided";
type Channel = "referral" | "conference" | "search" | "other";

interface FormState {
  name: string;
  school: string;
  department: string;
  professorTitle: string;
  email: string;
  subject: string;
  studentCount: string;
  startTiming: StartTiming | "";
  channel: Channel | "";
  message: string;
}

interface FormErrors {
  name?: string;
  school?: string;
  department?: string;
  professorTitle?: string;
  email?: string;
  subject?: string;
  studentCount?: string;
  startTiming?: string;
  channel?: string;
}

const initialState: FormState = {
  name: "",
  school: "",
  department: "",
  professorTitle: "",
  email: "",
  subject: "",
  studentCount: "",
  startTiming: "",
  channel: "",
  message: "",
};

type Touched = Partial<Record<keyof FormState, boolean>>;

export default function BetaApplyContent() {
  const { t } = useMarketingI18n();
  const [form, setForm] = useState<FormState>(initialState);
  const [touched, setTouched] = useState<Touched>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const errors: FormErrors = useMemo(() => {
    const e: FormErrors = {};
    const required = t("betaApply.validation.required");
    if (!isFilled(form.name)) e.name = required;
    if (!isFilled(form.school)) e.school = required;
    if (!isFilled(form.department)) e.department = required;
    if (!isFilled(form.professorTitle)) e.professorTitle = required;
    if (!isFilled(form.email)) {
      e.email = required;
    } else if (!isEmail(form.email)) {
      e.email = t("betaApply.validation.emailFormat");
    }
    if (!isFilled(form.subject)) e.subject = required;
    if (!isNumericOrEmpty(form.studentCount)) {
      e.studentCount = t("betaApply.validation.studentNumberFormat");
    }
    if (!form.startTiming) e.startTiming = required;
    if (!form.channel) e.channel = required;
    return e;
  }, [form, t]);

  const isValid = Object.keys(errors).length === 0;

  // Soft hint shown on the email field when it's a non-school address. Never
  // blocks submission.
  const emailHint =
    isFilled(form.email) && isEmail(form.email) && !looksLikeSchoolEmail(form.email)
      ? t("betaApply.validation.schoolEmail")
      : undefined;

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
    // Force-show all errors on submit so the user sees them even without
    // having blurred each field.
    setTouched({
      name: true,
      school: true,
      department: true,
      professorTitle: true,
      email: true,
      subject: true,
      studentCount: true,
      startTiming: true,
      channel: true,
    });
    if (!isValid || submitting) return;

    setSubmitting(true);
    try {
      // No backend endpoint yet — see BACKEND_ASKS.R2W4.md. We simulate the
      // round-trip with a small delay so the success state isn't jarring.
      await new Promise((resolve) => setTimeout(resolve, 500));
      setSubmitted(true);
    } catch {
      setSubmitError(t("betaApply.errorBanner"));
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <MarketingShell>
        <section className="max-w-2xl mx-auto px-4 sm:px-6 py-24 text-center">
          <div
            className="mx-auto w-14 h-14 rounded-full bg-amber-400/20 flex items-center justify-center text-amber-400 text-2xl mb-6"
            aria-hidden="true"
          >
            ✓
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {t("betaApply.successTitle")}
          </h1>
          <p className="mt-4 text-white/70 leading-relaxed whitespace-pre-line">
            {t("betaApply.successBody")}
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/demo"
              className="inline-flex justify-center rounded-xl bg-amber-400 text-black font-semibold px-5 py-2.5 text-sm hover:bg-amber-300 transition"
            >
              {t("betaApply.successCtaDemo")}
            </Link>
            <Link
              href="/"
              className="inline-flex justify-center rounded-xl border border-white/15 px-5 py-2.5 text-sm text-white/90 hover:bg-white/5 transition"
            >
              {t("betaApply.successCtaHome")}
            </Link>
          </div>
        </section>
      </MarketingShell>
    );
  }

  return (
    <MarketingShell>
      <section className="max-w-2xl mx-auto px-4 sm:px-6 pt-16 sm:pt-20 pb-10">
        <SectionHeader
          eyebrow={t("betaApply.hero.eyebrow")}
          title={t("betaApply.hero.title")}
          subtitle={t("betaApply.hero.subtitle")}
        />
      </section>

      <section className="max-w-2xl mx-auto px-4 sm:px-6 pb-24">
        <div
          className="mb-6 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] px-4 py-3 text-xs text-amber-200/90 leading-relaxed"
          role="note"
        >
          {t("betaApply.mockNotice")}
        </div>

        {submitError && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
          >
            {submitError}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          noValidate
          className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.02] p-6 sm:p-8"
        >
          <FormField
            label={t("betaApply.fields.name")}
            placeholder={t("betaApply.fields.namePlaceholder")}
            value={form.name}
            onChange={(v) => setField("name", v)}
            onBlur={() => markTouched("name")}
            error={showError("name")}
            required
            autoComplete="name"
          />
          <FormField
            label={t("betaApply.fields.school")}
            placeholder={t("betaApply.fields.schoolPlaceholder")}
            value={form.school}
            onChange={(v) => setField("school", v)}
            onBlur={() => markTouched("school")}
            error={showError("school")}
            required
            autoComplete="organization"
          />
          <FormField
            label={t("betaApply.fields.department")}
            placeholder={t("betaApply.fields.departmentPlaceholder")}
            value={form.department}
            onChange={(v) => setField("department", v)}
            onBlur={() => markTouched("department")}
            error={showError("department")}
            required
          />
          <FormField
            label={t("betaApply.fields.title")}
            placeholder={t("betaApply.fields.titlePlaceholder")}
            value={form.professorTitle}
            onChange={(v) => setField("professorTitle", v)}
            onBlur={() => markTouched("professorTitle")}
            error={showError("professorTitle")}
            required
          />
          <FormField
            label={t("betaApply.fields.email")}
            placeholder={t("betaApply.fields.emailPlaceholder")}
            value={form.email}
            onChange={(v) => setField("email", v)}
            onBlur={() => markTouched("email")}
            error={showError("email")}
            hint={emailHint}
            required
            type="email"
            autoComplete="email"
            inputMode="email"
          />
          <FormField
            label={t("betaApply.fields.subject")}
            placeholder={t("betaApply.fields.subjectPlaceholder")}
            value={form.subject}
            onChange={(v) => setField("subject", v)}
            onBlur={() => markTouched("subject")}
            error={showError("subject")}
            required
          />
          <FormField
            label={t("betaApply.fields.studentCount")}
            placeholder={t("betaApply.fields.studentCountPlaceholder")}
            value={form.studentCount}
            onChange={(v) => setField("studentCount", v)}
            onBlur={() => markTouched("studentCount")}
            error={showError("studentCount")}
            inputMode="numeric"
          />
          <FormField
            variant="select"
            label={t("betaApply.fields.startTiming")}
            value={form.startTiming}
            onChange={(v) => setField("startTiming", v as StartTiming | "")}
            onBlur={() => markTouched("startTiming")}
            error={showError("startTiming")}
            required
            options={[
              { value: "now", label: t("betaApply.fields.startOptions.now") },
              {
                value: "nextSemester",
                label: t("betaApply.fields.startOptions.nextSemester"),
              },
              {
                value: "undecided",
                label: t("betaApply.fields.startOptions.undecided"),
              },
            ]}
          />
          <FormField
            variant="select"
            label={t("betaApply.fields.channel")}
            value={form.channel}
            onChange={(v) => setField("channel", v as Channel | "")}
            onBlur={() => markTouched("channel")}
            error={showError("channel")}
            required
            options={[
              {
                value: "referral",
                label: t("betaApply.fields.channelOptions.referral"),
              },
              {
                value: "conference",
                label: t("betaApply.fields.channelOptions.conference"),
              },
              {
                value: "search",
                label: t("betaApply.fields.channelOptions.search"),
              },
              {
                value: "other",
                label: t("betaApply.fields.channelOptions.other"),
              },
            ]}
          />
          <FormField
            variant="textarea"
            label={t("betaApply.fields.message")}
            placeholder={t("betaApply.fields.messagePlaceholder")}
            value={form.message}
            onChange={(v) => setField("message", v)}
          />

          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting
                ? t("betaApply.submittingButton")
                : t("betaApply.submitButton")}
            </button>
            <p className="mt-3 text-center text-xs text-white/40">
              {t("betaApply.footerNote")}
            </p>
          </div>
        </form>
      </section>
    </MarketingShell>
  );
}
