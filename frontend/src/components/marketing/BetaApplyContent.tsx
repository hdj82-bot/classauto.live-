"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import LightMarketingShell from "./LightMarketingShell";
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
      // 공개 엔드포인트(비로그인) — 신청은 운영자 콘솔(/admin) 수신함으로 모인다.
      await api.post("/api/beta-applications", {
        name: form.name,
        school: form.school,
        department: form.department,
        professor_title: form.professorTitle,
        email: form.email,
        subject: form.subject,
        student_count: form.studentCount || null,
        start_timing: form.startTiming,
        channel: form.channel,
        message: form.message || null,
      });
      setSubmitted(true);
    } catch {
      setSubmitError(t("betaApply.errorBanner"));
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
            {t("betaApply.successTitle")}
          </h1>
          <p className="mt-4 text-[rgba(10,10,10,0.72)] leading-relaxed whitespace-pre-line">
            {t("betaApply.successBody")}
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/demo"
              className="inline-flex justify-center rounded-xl bg-[#FFB627] text-[#1A1A1A] font-semibold px-5 py-2.5 text-sm hover:bg-[#FFC74D] transition motion-reduce:transition-none shadow-lg shadow-[rgba(255,182,39,0.30)]"
            >
              {t("betaApply.successCtaDemo")}
            </Link>
            <Link
              href="/"
              className="inline-flex justify-center rounded-xl border border-[rgba(10,10,10,0.16)] px-5 py-2.5 text-sm text-[#0A0A0A] hover:bg-black/5 transition motion-reduce:transition-none"
            >
              {t("betaApply.successCtaHome")}
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
          {t("betaApply.hero.eyebrow")}
        </p>
        {/* 사용자 결정 2026-05-13 PM: 의도된 줄바꿈을 i18n 문자열 안의 `\n` 으로
            표현하고, `whitespace-pre-line` 으로 그대로 렌더. 좁은 폭에서는 추가
            wrap 도 자연스럽게 일어나, 모바일·태블릿 양쪽에서 카피가 잘리지 않는다. */}
        <h1
          className="text-[#0A0A0A] tracking-tight leading-[1.08] whitespace-pre-line"
          style={{
            fontFamily:
              "var(--font-display, 'Paperlogy'), 'Pretendard Variable', sans-serif",
            fontSize: "clamp(32px, 5vw, 56px)",
            fontWeight: 800,
            letterSpacing: "-0.035em",
          }}
        >
          {t("betaApply.hero.title")}
        </h1>
        <p className="mt-5 text-base sm:text-lg text-[rgba(10,10,10,0.62)] max-w-xl mx-auto leading-relaxed whitespace-pre-line">
          {t("betaApply.hero.subtitle")}
        </p>
      </section>

      <section className="max-w-2xl mx-auto px-4 sm:px-6 pb-24">
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
          className="space-y-4 sm:space-y-5 rounded-2xl border border-[rgba(10,10,10,0.08)] bg-white p-4 sm:p-6 md:p-8 shadow-[0_4px_16px_rgba(10,10,10,0.04)]"
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
              className="w-full rounded-xl px-5 py-3 text-sm font-semibold text-[#1A1A1A] transition motion-reduce:transition-none disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: submitting
                  ? "#E89E0B"
                  : "linear-gradient(135deg, #FFC74D 0%, #FFB627 50%, #E89E0B 100%)",
                boxShadow: "0 8px 24px rgba(255,182,39,0.30)",
              }}
            >
              {submitting
                ? t("betaApply.submittingButton")
                : t("betaApply.submitButton")}
            </button>
            <p className="mt-3 text-center text-xs text-[rgba(10,10,10,0.45)]">
              {t("betaApply.footerNote")}
            </p>
          </div>
        </form>
      </section>
    </LightMarketingShell>
  );
}
