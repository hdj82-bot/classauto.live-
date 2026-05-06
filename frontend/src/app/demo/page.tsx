"use client";

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
 * /demo 페이지 — 베타 신청 전환의 핵심 체험 페이지.
 *
 * 설계 근거: docs/planning/04-demo-page.md (확정 2026-05-05).
 *
 * 단일 목적: "3분 안에 학생 입장이 되어보고 '진짜 다르네'를 느끼게."
 *
 * 페이지 구조 (Section 3):
 *   1. 미니 히어로 + 분야 선택
 *   2. 체험 환경 (영상 + Q&A)
 *   3. CTA 모달 (3건 사용 시 트리거)
 *   4. 데모 FAQ (4문항)
 *   5. 푸터 CTA
 *
 * 전체 페이지를 다크 모드 강제 (`#0A0A0A`) — 학습자 시점 시각 신호.
 */
interface DemoSession {
  field: DemoField;
  startedAt: number;
}

export default function DemoPage() {
  const { t } = useDemoI18n();
  // field 와 startedAt 을 한 객체로 묶어 startedAt 이 항상 field 와 함께
  // 정의되도록 한다 — Date.now() 를 render 에서 호출하지 않게 하기 위함.
  const [session, setSession] = useState<DemoSession | null>(null);
  const [ctaOpen, setCtaOpen] = useState(false);
  const [challengeDone, setChallengeDone] = useState(false);
  const inputAnchorRef = useRef<HTMLDivElement>(null);

  // 분야 선택 → 체험 시작 타임스탬프 기록
  const handleSelect = useCallback((f: DemoField) => {
    setSession({ field: f, startedAt: Date.now() });
    setCtaOpen(false);
    setChallengeDone(false);
    // 다음 paint 후 체험 영역으로 스크롤
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
    // 시각적 모먼텀을 위해 살짝 늦춰서 모달 노출
    window.setTimeout(() => setCtaOpen(true), 400);
  }, []);

  const handleTryNow = useCallback(() => {
    setChallengeDone(true);
    document.getElementById("demo-q-input")?.focus();
  }, []);

  // 페이지 진입 시 다크 모드 색상 변수 강제
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
    <div className="min-h-screen bg-[#0A0A0A] text-white">
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

      {/* 한국어 검색 엔진 친화 — 페이지 본문 외 메타 텍스트 */}
      <span className="sr-only">{t("meta.pageDescription")}</span>
    </div>
  );
}

/* ---------------- Sub-sections ---------------- */

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
      className="relative pt-12 pb-10 sm:pt-16 sm:pb-12 px-4 sm:px-6 overflow-hidden"
      aria-labelledby="demo-hero-title"
    >
      {/* aurora background */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 20% 30%, rgba(167,139,250,0.18), transparent 50%), radial-gradient(ellipse at 80% 70%, rgba(255,182,39,0.14), transparent 50%), radial-gradient(ellipse at 50% 50%, rgba(34,211,238,0.10), transparent 60%)",
        }}
      />
      <div className="relative max-w-5xl mx-auto text-center">
        <p className="text-[11px] tracking-[0.22em] uppercase text-[#FFB627] mb-4">
          {t("hero.eyebrow")}
        </p>
        <h1
          id="demo-hero-title"
          className="font-bold tracking-tight text-white"
          style={{
            fontFamily: "'Paperlogy', 'Pretendard Variable', sans-serif",
            fontSize: "clamp(36px, 6vw, 64px)",
            lineHeight: 1.05,
            letterSpacing: "-0.04em",
          }}
        >
          {t("hero.headline1")}
          <br />
          <span style={{ color: "#FFB627" }}>{t("hero.headline2")}</span>
        </h1>
        <p className="mt-5 text-base sm:text-lg text-white/65 max-w-2xl mx-auto leading-relaxed">
          {t("hero.subtitle")}
        </p>
        <ul className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-white/55">
          <li>⏱️ {t("hero.metaTime")}</li>
          <li>💬 {t("hero.metaQuestions")}</li>
          <li>📱 {t("hero.metaMobile")}</li>
        </ul>

        {canSwitch && (
          <button
            type="button"
            onClick={onSwitch}
            className="mt-6 inline-flex items-center gap-1 text-xs text-white/55 hover:text-white transition"
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
            style={{ fontFamily: "'Paperlogy', 'Pretendard Variable', sans-serif", letterSpacing: "-0.03em" }}
          >
            {t("fieldSelect.title")}
          </h2>
          <p className="mt-2 text-sm text-white/55 max-w-xl mx-auto">
            {t("fieldSelect.subtitle")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            className="text-white/65 hover:text-white transition"
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
          style={{ fontFamily: "'Paperlogy', 'Pretendard Variable', sans-serif", letterSpacing: "-0.03em" }}
        >
          {t("footerCta.title")}
        </h2>
        <p className="text-white/60 max-w-xl mx-auto mb-8">
          {t("footerCta.subtitle")}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href="/beta-apply"
            data-testid="demo-footer-beta-cta"
            className="inline-flex items-center justify-center px-7 py-3.5 rounded-xl bg-[#FFB627] text-[#0A0A0A] font-semibold text-sm hover:bg-[#FFC74D] transition shadow-lg shadow-[#FFB627]/20"
          >
            {t("footerCta.primary")}
          </a>
          <a
            href="/pricing"
            className="inline-flex items-center justify-center px-7 py-3.5 rounded-xl border border-white/15 text-white/85 font-semibold text-sm hover:bg-white/5 transition"
          >
            {t("footerCta.secondary")}
          </a>
        </div>
      </div>
    </section>
  );
}
