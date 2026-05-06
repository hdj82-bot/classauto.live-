"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import MarketingShell from "./MarketingShell";
import SectionHeader from "./SectionHeader";
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
      <MarketingShell>
        <section className="max-w-2xl mx-auto px-4 sm:px-6 py-24 text-center">
          <div
            className="mx-auto w-14 h-14 rounded-full bg-amber-400/20 flex items-center justify-center text-amber-400 text-2xl mb-6"
            aria-hidden="true"
          >
            ✓
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {t("contact.successTitle")}
          </h1>
          <p className="mt-4 text-white/70 leading-relaxed whitespace-pre-line">
            {t("contact.successBody")}
          </p>
          <div className="mt-8">
            <Link
              href="/"
              className="inline-flex justify-center rounded-xl border border-white/15 px-5 py-2.5 text-sm text-white/90 hover:bg-white/5 transition"
            >
              {t("common.backToHome")}
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
          eyebrow={t("contact.hero.eyebrow")}
          title={t("contact.hero.title")}
          subtitle={t("contact.hero.subtitle")}
        />
      </section>

      <section className="max-w-2xl mx-auto px-4 sm:px-6 pb-24">
        <div
          className="mb-6 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] px-4 py-3 text-xs text-amber-200/90 leading-relaxed"
          role="note"
        >
          {t("contact.mockNotice")}
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
              className="w-full rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting
                ? t("contact.submittingButton")
                : t("contact.submitButton")}
            </button>
            <p className="mt-3 text-center text-xs text-white/40">
              {t("contact.footerNote")}
            </p>
          </div>
        </form>
      </section>
    </MarketingShell>
  );
}
