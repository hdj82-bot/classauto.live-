"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import DemoCTAModal from "@/components/demo/DemoCTAModal";
import DemoFAQ from "@/components/demo/DemoFAQ";
import DemoVideo from "@/components/demo/DemoVideo";
import FieldSelectCard from "@/components/demo/FieldSelectCard";
import GradientDefs from "@/components/demo/GradientDefs";
import HeroFlowStage from "@/components/demo/HeroFlowStage";
import OffTopicHint from "@/components/demo/OffTopicHint";
import QASimulator from "@/components/demo/QASimulator";
import TrustStrip from "@/components/demo/TrustStrip";
import { useDemoI18n } from "@/components/demo/useDemoI18n";
import {
  buildDemoHeroFlowLabels,
  buildDemoTrustStripLabels,
} from "@/components/demo/labels";
import type { DemoField } from "@/components/demo/demoTypes";
import "./demo-v3.css";

/**
 * /demo 페이지 — 베타 신청 전환의 핵심 체험 페이지 (v3).
 *
 * 디자인 근거:
 *   - docs/prototypes/04-demo-page.html.html (standalone, 2026-05-13)
 *   - docs/planning/04-demo-page.md (스펙, 2026-05-06 갱신; 본 PR 에서 미니
 *     히어로 카피만 standalone 에 맞춰 갱신 — 갱신 이력은 동일 문서 참조)
 *
 * v3 핵심 변경:
 *   - 페이지 진입 표면이 **라이트 베이지(`#FAFAF7`)** 로 전환 (v2 강제 다크 폐기).
 *   - 다크 톤은 학생 시청 영역(`ExperienceSection`) 안에서만 적용 — colors.md §1
 *     "영상이 있으면 다크" 원칙 유지.
 *   - 미니 히어로 2-column (텍스트 + flow-stage 일러스트), 카피 "대본 한 번,
 *     학생과는 끝없는 대화" — 사용자 결정(2026-05-13).
 *   - 분야 카드 라이트 톤 + 코너 그라데이션 mesh.
 *   - 분야 카드 아래 4-cell Trust strip 신규 (24시간 자동 삭제, RAG 0.65 등).
 *
 * 유지:
 *   - DemoField / DEMO_FIELDS / isOnTopic 도메인 모델
 *   - handleSelect → setSession → ExperienceSection 라우팅
 *   - QASimulator → onLimitReached → DemoCTAModal
 *   - DemoFAQ / FooterCTA (다크) — standalone 디자인 범위 밖, 변경 없음
 */
interface DemoSession {
  field: DemoField;
  startedAt: number;
}

export default function DemoPage() {
  // useSearchParams 는 Suspense boundary 안에서만 동작 → 별도 컴포넌트로 격리.
  return (
    <Suspense fallback={null}>
      <DemoPageBody />
    </Suspense>
  );
}

function DemoPageBody() {
  const { t } = useDemoI18n();
  const searchParams = useSearchParams();
  const initialField = useMemo(() => {
    const raw = searchParams.get("field");
    return raw === "social" || raw === "natural" ? raw : null;
  }, [searchParams]);

  const [session, setSession] = useState<DemoSession | null>(() =>
    initialField ? { field: initialField, startedAt: Date.now() } : null,
  );
  const [ctaOpen, setCtaOpen] = useState(false);
  const [challengeDone, setChallengeDone] = useState(false);
  const inputAnchorRef = useRef<HTMLDivElement>(null);

  // / 페이지의 분야 카드에서 `/demo?field=X` 로 deep-link 진입 시 자동 스크롤.
  useEffect(() => {
    if (initialField) {
      queueMicrotask(() => {
        document
          .getElementById("demo-experience")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [initialField]);

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

  const handleStartCta = useCallback(() => {
    document
      .getElementById("demo-field-select")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <div
      className="ca-demo-root min-h-screen antialiased"
      style={{
        background: "#FAFAF7",
        color: "var(--ca-text, #0A0A0A)",
        fontFamily:
          "var(--font-body, 'Pretendard Variable'), 'Pretendard', system-ui, sans-serif",
      }}
    >
      <GradientDefs />

      <DemoTopBar />

      <main>
        <DemoHero
          canSwitch={session !== null}
          onSwitch={handleSwitchField}
          onStart={handleStartCta}
        />

        {session === null ? (
          <>
            <FieldSelectionSection onSelect={handleSelect} />
            <TrustStrip labels={buildDemoTrustStripLabels(t)} />
          </>
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
      </main>

      {/* FAQ / FooterCTA 는 standalone 디자인 범위 밖 — 기존 다크 톤 유지.
          (라이트 → 다크 전환 위로 한 번 표시되는 식. 후속 PR 에서 라이트 버전
          만든다면 별도 결정.) */}
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
 * 라이트 톤 상단 바 — standalone 디자인의 header 그대로 변환.
 * 방패+체크 brand mark, 4-link nav (Live Demo pill 포함), outline 베타 신청 CTA.
 */
function DemoTopBar() {
  const { t } = useDemoI18n();
  return (
    <header className="ca-header">
      <div className="ca-header-inner">
        <Link href="/" className="ca-brand" aria-label="ClassAuto 홈으로">
          <span className="ca-brand-mark" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 6.5l7-3 7 3v6c0 4-3 6.7-7 8.5-4-1.8-7-4.5-7-8.5v-6z" />
              <path d="M9 11.5l2.2 2.2L15 9.5" />
            </svg>
          </span>
          ClassAuto
        </Link>

        <nav className="ca-header-nav" aria-label="Primary">
          <Link href="/features">{t("marketingHeader.navFeatures")}</Link>
          <Link href="/use-cases">{t("marketingHeader.navUseCases")}</Link>
          <Link href="/pricing">{t("marketingHeader.navPricing")}</Link>
          <span className="ca-demo-pill">{t("marketingHeader.livePill")}</span>
        </nav>

        <Link href="/beta-apply" className="ca-header-cta">
          {t("marketingHeader.cta")}
        </Link>
      </div>
    </header>
  );
}

function DemoHero({
  canSwitch,
  onSwitch,
  onStart,
}: {
  canSwitch: boolean;
  onSwitch: () => void;
  onStart: () => void;
}) {
  const { t } = useDemoI18n();
  return (
    <section className="ca-hero" aria-labelledby="demo-hero-title">
      <div className="ca-aurora" aria-hidden="true" />

      <div className="ca-hero-inner">
        <div className="ca-hero-text">
          <span className="ca-hero-eyebrow">
            <span className="ca-dot" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12l5 5L20 7" />
              </svg>
            </span>
            {t("heroV3.observerBadge")}
          </span>

          <h1 id="demo-hero-title">
            {t("heroV3.headlineLead")}
            <br />
            {t("heroV3.headlineTail")}{" "}
            <span className="ca-accent">{t("heroV3.headlineAccent")}</span>
          </h1>

          <p className="ca-hero-sub">{t("heroV3.subtitle")}</p>
          <p className="ca-hero-sub-tag">{t("heroV3.subTag")}</p>

          <div className="ca-hero-meta">
            <span className="ca-meta-chip">{t("heroV3.metaTime")}</span>
            <span className="ca-meta-chip">{t("heroV3.metaQuestions")}</span>
            <span className="ca-meta-chip">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
                <path d="M11 18.5h2" />
              </svg>
              {t("heroV3.metaMobile")}
            </span>
          </div>

          <div className="ca-hero-actions">
            <button
              type="button"
              className="ca-btn-primary"
              onClick={onStart}
              data-testid="demo-hero-start"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M7 4.5v15a1 1 0 0 0 1.55.83l11-7.5a1 1 0 0 0 0-1.66l-11-7.5A1 1 0 0 0 7 4.5z" />
              </svg>
              {t("heroV3.primaryCta")}
            </button>
            <Link href="/features" className="ca-btn-secondary">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="url(#ca-grad-violet)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                width="16"
                height="16"
              >
                <path d="M4 5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5z" />
                <path d="M13 3v5h5" />
              </svg>
              {t("heroV3.secondaryCta")}
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                width="14"
                height="14"
              >
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          {canSwitch && (
            <button
              type="button"
              onClick={onSwitch}
              className="mt-6 inline-flex items-center gap-1 text-xs font-medium transition motion-reduce:transition-none"
              style={{ color: "var(--ca-text-subtle, rgba(10,10,10,0.42))" }}
            >
              ↺ {t("fieldSelect.switch")}
            </button>
          )}
        </div>

        <HeroFlowStage labels={buildDemoHeroFlowLabels(t)} />
      </div>
    </section>
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
      className="ca-fields"
      aria-labelledby="demo-field-heading"
    >
      <div className="ca-fields-inner">
        <div className="ca-fields-header">
          <div>
            <h2 className="ca-fields-title" id="demo-field-heading">
              {t("fieldSelectV3.title")}
            </h2>
            <p className="ca-fields-subtitle">{t("fieldSelectV3.subtitle")}</p>
          </div>
        </div>

        <div className="ca-field-grid">
          <FieldSelectCard field="social" onSelect={onSelect} />
          <FieldSelectCard field="natural" onSelect={onSelect} />
        </div>
      </div>
    </section>
  );
}

/**
 * 분야 선택 후 시청·Q&A 영역. 디자인 standalone 범위 밖 — colors.md §1
 * (영상은 다크) 에 따라 자체 다크 표면을 가진다. 기존 v2 스타일 유지.
 */
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
      className="px-4 sm:px-6 pb-16 pt-12 text-white"
      style={{ background: "#0A0A0A" }}
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
      className="border-t border-white/10 bg-[#0E0E0E] py-16 px-4 sm:px-6 text-white"
      aria-labelledby="demo-footer-cta-heading"
    >
      <div className="max-w-3xl mx-auto text-center">
        <h2
          id="demo-footer-cta-heading"
          className="text-2xl sm:text-3xl font-bold mb-3"
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
