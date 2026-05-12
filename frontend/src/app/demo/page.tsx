"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import DemoCTAModal from "@/components/demo/DemoCTAModal";
import DemoFAQ from "@/components/demo/DemoFAQ";
import DemoVideo from "@/components/demo/DemoVideo";
import FieldSelectCard from "@/components/demo/FieldSelectCard";
import OffTopicHint from "@/components/demo/OffTopicHint";
import QASimulator from "@/components/demo/QASimulator";
import { useDemoI18n } from "@/components/demo/useDemoI18n";
import type { DemoField } from "@/components/demo/demoTypes";

/**
 * /demo 페이지 — 베타 신청 전환의 핵심 체험 페이지 (v2).
 *
 * 설계 근거: docs/planning/04-demo-page.md (확정 2026-05-05 · 갱신 2026-05-06).
 *
 * v2 메시지 정정 (heroV2 키 신규):
 *   - ❌ "학생이 되어보세요" (잘못된 메시지 — 04-demo-page.md §4.2)
 *   - ✅ "강의 영상이 학생에게 답합니다" (관찰자 시점 §1)
 *
 * 페이지 구조 (Section 3):
 *   1. 미니 히어로 + 분야 선택 (라이트 미니 히어로 위 다크 카드 슬롯이 정책상
 *      가능하지만, 본 PR 은 단순성과 영상 몰입을 위해 페이지 전체 다크 유지)
 *   2. 체험 환경 (영상 + Q&A)
 *   3. CTA 모달 (3건 사용 시 트리거)
 *   4. 데모 FAQ (4문항)
 *   5. 푸터 CTA
 *
 * 전체 페이지를 다크 모드 강제 (`#0A0A0A`) — colors.md §1 (영상이 있으면 다크).
 */
interface DemoSession {
  field: DemoField;
  startedAt: number;
}

export default function DemoPage() {
  const { t } = useDemoI18n();
  const [session, setSession] = useState<DemoSession | null>(null);
  const [ctaOpen, setCtaOpen] = useState(false);
  const [challengeDone, setChallengeDone] = useState(false);
  const inputAnchorRef = useRef<HTMLDivElement>(null);

  const handleSelect = useCallback((f: DemoField) => {
    setSession({ field: f, startedAt: Date.now() });
    setCtaOpen(false);
    setChallengeDone(false);
    queueMicrotask(() => {
      document
        .getElementById("demo-experience")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const handleSwitchField = useCallback(() => {
    setSession(null);
    setCtaOpen(false);
    queueMicrotask(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }, []);

  const handleLimitReached = useCallback(() => {
    window.setTimeout(() => setCtaOpen(true), 400);
  }, []);

  const handleTryNow = useCallback(() => {
    setChallengeDone(true);
    document.getElementById("demo-q-input")?.focus();
  }, []);

  // 페이지 진입 시 다크 모드 색상 변수 강제 — 다른 페이지로 이동 시 복원.
  // 04-demo-page.md §6.2 "페이지 진입 즉시 다크 모드".
  useEffect(() => {
    const root = document.documentElement;
    const previousBg = root.style.getPropertyValue("--background");
    const previousFg = root.style.getPropertyValue("--foreground");
    root.style.setProperty("--background", "#0A0A0A");
    root.style.setProperty("--foreground", "#FFFFFF");
    return () => {
      root.style.setProperty("--background", previousBg);
      root.style.setProperty("--foreground", previousFg);
    };
  }, []);

  return (
    <div
      className="min-h-screen bg-[#0A0A0A] text-white antialiased"
      style={{
        fontFamily:
          "var(--font-body, 'Pretendard Variable'), 'Pretendard', system-ui, sans-serif",
      }}
    >
      {/* 다크 셸 위의 최소 헤더 — 메인으로 복귀 링크 + 베타 신청 CTA */}
      <DemoTopBar />

      <DemoHero
        canSwitch={session !== null}
        onSwitch={handleSwitchField}
      />

      {session === null ? (
        <FieldSelectionSection onSelect={handleSelect} />
      ) : (
        <ExperienceSection
          key={session.field}
          field={session.field}
          startedAt={session.startedAt}
          challengeDone={challengeDone}
          onLimitReached={handleLimitReached}
          onTryNow={handleTryNow}
          onSwitch={handleSwitchField}
          inputAnchorRef={inputAnchorRef}
        />
      )}

      <DemoFAQ />

      <FooterCTA />

      <DemoCTAModal
        open={ctaOpen}
        onClose={() => setCtaOpen(false)}
        onReplay={handleSwitchField}
      />

      <span className="sr-only">{t("meta.pageDescription")}</span>
    </div>
  );
}

/* ---------------- Sub-sections ---------------- */

/**
 * 데모 페이지 전용 최소 상단 바 — 다크 톤이므로 LightMarketingShell 사용 안 함.
 * CA 워드마크 + 베타 신청 골드 CTA + 메인 복귀 outline.
 */
function DemoTopBar() {
  return (
    <header className="sticky top-0 z-30 backdrop-blur-md bg-black/40 border-b border-white/5">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link
          href="/"
          aria-label="ClassAuto home"
          className="flex items-center gap-2 group"
        >
          <span
            className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold tracking-wider text-[#1A1A1A] transition-transform group-hover:scale-105 motion-reduce:transition-none"
            style={{
              background:
                "linear-gradient(135deg, #FFC74D 0%, #FFB627 50%, #E89E0B 100%)",
            }}
            aria-hidden="true"
          >
            CA
          </span>
          <span
            className="text-sm font-semibold tracking-wide hidden sm:inline"
            style={{
              fontFamily:
                "var(--font-display, 'Paperlogy'), 'Pretendard Variable', sans-serif",
            }}
          >
            ClassAuto
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/features"
            className="hidden sm:inline-flex text-xs font-medium text-white/65 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/5 transition motion-reduce:transition-none"
          >
            기능
          </Link>
          <Link
            href="/pricing"
            className="hidden sm:inline-flex text-xs font-medium text-white/65 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/5 transition motion-reduce:transition-none"
          >
            요금제
          </Link>
          <Link
            href="/beta-apply"
            className="inline-flex text-xs font-semibold rounded-lg bg-[#FFB627] text-[#1A1A1A] px-3 py-1.5 hover:bg-[#FFC74D] transition motion-reduce:transition-none"
          >
            베타 신청
          </Link>
        </div>
      </div>
    </header>
  );
}

function DemoHero({
  canSwitch,
  onSwitch,
}: {
  canSwitch: boolean;
  onSwitch: () => void;
}) {
  const { t } = useDemoI18n();
  return (
    <header
      className="relative pt-14 pb-12 sm:pt-20 sm:pb-16 px-4 sm:px-6 overflow-hidden"
      aria-labelledby="demo-hero-title"
    >
      {/* aurora background (다크 데모 한정, animations.md §2.1 톤) */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none opacity-80"
        style={{
          background:
            "radial-gradient(ellipse at 20% 30%, rgba(167,139,250,0.18), transparent 50%), radial-gradient(ellipse at 80% 70%, rgba(255,182,39,0.16), transparent 50%), radial-gradient(ellipse at 50% 50%, rgba(34,211,238,0.10), transparent 60%)",
        }}
      />
      <div className="relative max-w-5xl mx-auto text-center">
        {/* 관찰자 배지 — "체험" 단어 미사용, 관찰자 시점 명시 */}
        <span
          className="inline-flex items-center rounded-full border border-[rgba(255,182,39,0.40)] bg-[rgba(255,182,39,0.06)] px-3 py-1 text-[11px] tracking-[0.16em] uppercase text-[#FFB627] font-semibold mb-5"
        >
          {t("heroV2.observerBadge")}
        </span>
        <p className="text-[11px] tracking-[0.22em] uppercase text-[#FFB627] mb-4">
          {t("heroV2.eyebrow")}
        </p>
        <h1
          id="demo-hero-title"
          className="text-white"
          style={{
            fontFamily:
              "var(--font-display, 'Paperlogy'), 'Pretendard Variable', sans-serif",
            fontSize: "clamp(36px, 6vw, 64px)",
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: "-0.04em",
          }}
        >
          {t("heroV2.headlineLead")}
          <br />
          <span style={{ color: "#FFB627" }}>{t("heroV2.headlineAccent")}</span>
        </h1>
        <p className="mt-6 text-base sm:text-lg text-white/65 max-w-2xl mx-auto leading-relaxed">
          {t("heroV2.subtitle")}
        </p>
        <ul
          className="mt-7 flex flex-wrap justify-center gap-2 sm:gap-3 text-xs"
          aria-label={t("heroV2.observerBadge")}
        >
          {[
            t("heroV2.metaTime"),
            t("heroV2.metaQuestions"),
            t("heroV2.metaMobile"),
          ].map((chip) => (
            <li
              key={chip}
              className="inline-flex items-center rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-white/75"
            >
              {chip}
            </li>
          ))}
        </ul>

        {canSwitch && (
          <button
            type="button"
            onClick={onSwitch}
            className="mt-6 inline-flex items-center gap-1 text-xs text-white/55 hover:text-white transition motion-reduce:transition-none"
          >
            ↺ {t("fieldSelect.switch")}
          </button>
        )}
      </div>
    </header>
  );
}

function FieldSelectionSection({
  onSelect,
}: {
  onSelect: (f: DemoField) => void;
}) {
  const { t } = useDemoI18n();
  return (
    <section
      id="demo-field-select"
      className="px-4 sm:px-6 pb-20"
      aria-labelledby="demo-field-heading"
    >
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <h2
            id="demo-field-heading"
            className="text-2xl sm:text-3xl font-bold text-white"
            style={{
              fontFamily:
                "var(--font-display, 'Paperlogy'), 'Pretendard Variable', sans-serif",
              letterSpacing: "-0.03em",
            }}
          >
            {t("fieldSelectV2.title")}
          </h2>
          <p className="mt-3 text-sm sm:text-base text-white/55 max-w-2xl mx-auto leading-relaxed">
            {t("fieldSelectV2.subtitle")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
          <FieldSelectCard field="social" onSelect={onSelect} />
          <FieldSelectCard field="natural" onSelect={onSelect} />
        </div>
      </div>
    </section>
  );
}

function ExperienceSection({
  field,
  startedAt,
  challengeDone,
  onLimitReached,
  onTryNow,
  onSwitch,
  inputAnchorRef,
}: {
  field: DemoField;
  startedAt: number;
  challengeDone: boolean;
  onLimitReached: () => void;
  onTryNow: () => void;
  onSwitch: () => void;
  inputAnchorRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { t } = useDemoI18n();
  const [elapsed, setElapsed] = useState("0:00");

  useEffect(() => {
    const tick = () => {
      const sec = Math.floor((Date.now() - startedAt) / 1000);
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      setElapsed(`${m}:${s.toString().padStart(2, "0")}`);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const fieldLabel = field === "social"
    ? t("fieldSelect.social.label")
    : t("fieldSelect.natural.label");

  return (
    <section
      id="demo-experience"
      className="px-4 sm:px-6 pb-16"
      aria-label={t("experience.chatTitle")}
    >
      <div className="max-w-6xl mx-auto">
        {/* 상태 바 */}
        <div className="mb-4 flex items-center justify-between rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-[11px] text-white/55">
          <span data-testid="demo-status-bar">
            {t("experience.statusBar", { field: fieldLabel, elapsed })}
          </span>
          <button
            type="button"
            onClick={onSwitch}
            aria-label={t("a11y.switchField")}
            className="text-white/65 hover:text-white transition motion-reduce:transition-none"
          >
            ↺ {t("fieldSelect.switch")}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-4">
          <div ref={inputAnchorRef} className="space-y-4">
            <DemoVideo field={field} />
          </div>
          <div className="min-h-[480px]">
            <QASimulator field={field} onLimitReached={onLimitReached} />
          </div>
        </div>
      </div>

      <OffTopicHint
        startAt={startedAt}
        challengeDone={challengeDone}
        onTryNow={onTryNow}
      />
    </section>
  );
}

function FooterCTA() {
  const { t } = useDemoI18n();
  return (
    <section
      className="border-t border-white/10 bg-[#0E0E0E] py-16 px-4 sm:px-6"
      aria-labelledby="demo-footer-cta-heading"
    >
      <div className="max-w-3xl mx-auto text-center">
        <h2
          id="demo-footer-cta-heading"
          className="text-2xl sm:text-3xl font-bold text-white mb-3"
          style={{
            fontFamily:
              "var(--font-display, 'Paperlogy'), 'Pretendard Variable', sans-serif",
            letterSpacing: "-0.03em",
          }}
        >
          {t("footerCta.title")}
        </h2>
        <p className="text-white/60 max-w-xl mx-auto mb-8">
          {t("footerCta.subtitle")}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/beta-apply"
            data-testid="demo-footer-beta-cta"
            className="inline-flex items-center justify-center px-7 py-3.5 rounded-xl bg-[#FFB627] text-[#1A1A1A] font-semibold text-sm hover:bg-[#FFC74D] transition motion-reduce:transition-none shadow-lg shadow-[#FFB627]/30"
          >
            {t("footerCta.primary")}
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center px-7 py-3.5 rounded-xl border border-white/15 text-white/85 font-semibold text-sm hover:bg-white/5 transition motion-reduce:transition-none"
          >
            {t("footerCta.secondary")}
          </Link>
        </div>
      </div>
    </section>
  );
}
