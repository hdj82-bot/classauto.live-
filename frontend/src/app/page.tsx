"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import IconDefs from "@/components/landing/IconDefs";
import LightMarketingShell from "@/components/marketing/LightMarketingShell";
import { useLandingI18n } from "@/components/landing/useLandingI18n";
import { useMarketingI18n } from "@/components/marketing/useMarketingI18n";
import FieldSelectCard from "@/components/demo/FieldSelectCard";
import GradientDefs from "@/components/demo/GradientDefs";
import HeroFlowStage from "@/components/demo/HeroFlowStage";
import { buildDemoHeroFlowLabels } from "@/components/demo/labels";
import type { DemoField } from "@/components/demo/demoTypes";
import "./demo/demo-v3.css";

/**
 * `/` 랜딩 v3 — 첫 대문 축소판 (2026-05-13 후속, 사용자 결정 2026-05-13 PM).
 *
 * 변경 이력:
 *   - v3 초기 (#116): standalone /demo 프로토타입의 hero + 분야 카드 + Trust strip
 *     + Stats + 4가지 차별점 + Mesh + 3단계 + Adoption + Anchor + Final CTA 의
 *     "긴 마케팅 페이지" 형태였음.
 *   - v3.1 (본 커밋): 사용자 결정 — **두 분야 선택 카드 이후 전체 섹션 제거**.
 *     즉 TrustStrip / Stats / Differentiators / Mesh / Steps / Adoption /
 *     Anchor case / Final CTA 를 모두 삭제하고, 첫 대문(hero + fields)만 남긴
 *     "짧은 게이트웨이" 형태로 전환. 헤더·푸터는 LightMarketingShell 유지.
 *
 *     이유: 학생 화면 미리보기로 즉시 안내하는 게 메인 사이트의 1차 목적.
 *     긴 마케팅 콘텐츠는 /features · /use-cases · /pricing 등 별도 페이지로 분산.
 *
 * 디자인 언어:
 *   - 라이트 베이지(#FAFAF7) + 골드(--gold-on-light #B88308) — colors.md §1
 *   - Paperlogy 디스플레이 헤드라인 (typography.md §2)
 *   - HeroFlowStage / FieldSelectCard / GradientDefs 는 /demo 와 공유
 *
 * 정책 근거:
 *   - docs/prototypes/04-demo-page.html.html — standalone 디자인 (2026-05-13)
 *   - docs/planning/04-demo-page.md — /demo 스펙 (히어로 카피 정합)
 *   - docs/design-system/colors.md §1 — light beige + gold dual-surface
 */
/**
 * Hero 배경 영상 플레이리스트 (2026-05-15 추가).
 * 3개 mp4 가 순차 재생되며, 마지막이 끝나면 첫 번째로 돌아가 무한 순환.
 * 파일은 `frontend/public/` 직속에 배치. 화질·밝기·색온도는 일관성 유지를
 * 위해 동일 인코딩 프리셋으로 준비할 것 (hero-bg.mp4 기준 ~4.4MB, 라이트톤).
 */
const HERO_VIDEOS = ["/hero-bg.mp4", "/hero-bg-2.mp4", "/hero-bg-3.mp4"] as const;

export default function LandingPage() {
  const { t: tHub } = useLandingI18n();
  const { t: tCommon } = useMarketingI18n();
  const router = useRouter();

  // 분야 카드 선택 → /demo 로 deep-link. /demo 는 ?field=X 를 받아 자동 진입.
  const handleSelectField = useCallback(
    (f: DemoField) => {
      router.push(`/demo?field=${f}`);
    },
    [router],
  );

  // Hero 영상 크로스페이드 (2026-05-15 개선).
  //
  // 단일 <video> + onEnded 로 src 를 갈아끼우던 방식은 전환 시점에 browser 가
  // 새 파일을 로드하느라 poster 가 잠깐 노출되어 "끊김" 으로 보였다.
  // 두 개의 <video> 슬롯을 겹쳐 놓고 opacity 만 토글하면, 다음 영상이 미리
  // preload 되어 있어 페이드가 자연스럽다.
  //
  // 흐름:
  //   초기  → A=video[0] active 재생 · B=video[1] inactive 로 사전 로드
  //   A end → B active (페이드 인 + 재생) · A 슬롯에 video[2] 로드
  //   B end → A active (이미 video[2] 가 로드되어 있어 즉시 재생) · B 슬롯에 video[0]
  //   ... 반복
  const slotARef = useRef<HTMLVideoElement | null>(null);
  const slotBRef = useRef<HTMLVideoElement | null>(null);
  const [activeSlot, setActiveSlot] = useState<"A" | "B">("A");
  const [srcA, setSrcA] = useState<string>(HERO_VIDEOS[0]);
  const [srcB, setSrcB] = useState<string>(HERO_VIDEOS[1]);
  // 비활성 슬롯에 다음으로 채워 넣을 영상의 인덱스를 추적.
  const playlistCursorRef = useRef<number>(1);

  const handleHeroVideoEnded = useCallback((endedSlot: "A" | "B") => {
    setActiveSlot((current: "A" | "B") =>
      current === endedSlot ? (endedSlot === "A" ? "B" : "A") : current,
    );
    // 방금 끝난 슬롯(=곧 비활성) 에 다음 영상을 큐잉. 다음 사이클 때 이미 로드됨.
    playlistCursorRef.current = (playlistCursorRef.current + 1) % HERO_VIDEOS.length;
    const nextSrc = HERO_VIDEOS[playlistCursorRef.current];
    if (endedSlot === "A") {
      setSrcA(nextSrc);
    } else {
      setSrcB(nextSrc);
    }
  }, []);

  // 활성 슬롯이 바뀌면 그 영상을 0초부터 재생. 비활성 슬롯은 자연스레 멈춤.
  useEffect(() => {
    const v = (activeSlot === "A" ? slotARef : slotBRef).current;
    if (!v) return;
    v.currentTime = 0;
    void v.play().catch(() => {});
  }, [activeSlot]);

  // 슬롯의 src 가 바뀌면 load() 로 0:00 으로 리셋 (다음 활성화 때 즉시 0 부터 재생).
  useEffect(() => {
    slotARef.current?.load();
  }, [srcA]);
  useEffect(() => {
    slotBRef.current?.load();
  }, [srcB]);

  // standalone /demo hero 와 동일 컴포넌트를 / 에서도 재사용 — 텍스트만 landingHub
  // i18n 에서 주입한다 (의미상 marketing 도메인 i18n 분리 유지).
  const heroFlowLabels = buildDemoHeroFlowLabels((key) =>
    tHub(`demoFlow.${key.replace(/^flowStage\./, "")}`),
  );

  return (
    <LightMarketingShell>
      <IconDefs />

      {/* Hero — standalone /demo 디자인과 동일한 라이트 베이지 2-col hero.
          docs/prototypes/04-demo-page.html.html (2026-05-13) 기준.

          GradientDefs 는 페이지 내 자식 SVG (FieldSelectCard 의 글로브/원자) 가
          url(#ca-grad-*) 로 참조하기 위해 한 번 렌더한다. `.ca-demo-root` 는 데모
          전용 CSS 변수 + reduced-motion 가드의 스코프 — demo-v3.css 의 `.ca-*`
          클래스 자체도 네임스페이스라 다른 페이지와 충돌 없음. */}
      <div className="ca-demo-root">
        <GradientDefs />

        <section className="ca-hero" aria-labelledby="landing-hero-title">
          {/* 배경 영상 (z:0) → 오로라 메쉬 (z:0, 위) → 베이지 오버레이 (z:0, 위)
              → .ca-hero-inner (z:1) 순으로 쌓인다. muted+playsInline+autoPlay 는
              모바일(iOS Safari) 자동재생의 필수 3종. preload=metadata 로 LCP 보호.
              prefers-reduced-motion 시엔 demo-v3.css 에서 display:none 처리됨.
              2026-05-15: 3개 mp4 순차 반복 — loop 속성 대신 onEnded 로 다음 src 전환. */}
          {/* 두 슬롯 모두 absolute 풀스크린(.ca-hero-video) 으로 겹쳐 있고,
              .is-active 가 붙은 쪽만 opacity:1 로 보인다. autoPlay 는 슬롯 A 의
              초기 재생용 — 슬롯 전환 시에는 위의 useEffect 가 play() 를 호출한다.
              preload="auto" 로 두 영상 모두 즉시 버퍼링 시작 → 첫 전환 끊김 제거. */}
          <video
            ref={slotARef}
            className={`ca-hero-video${activeSlot === "A" ? " is-active" : ""}`}
            src={srcA}
            poster="/hero-bg-poster.jpg"
            autoPlay
            muted
            playsInline
            preload="auto"
            onEnded={() => handleHeroVideoEnded("A")}
            aria-hidden="true"
          />
          <video
            ref={slotBRef}
            className={`ca-hero-video${activeSlot === "B" ? " is-active" : ""}`}
            src={srcB}
            poster="/hero-bg-poster.jpg"
            muted
            playsInline
            preload="auto"
            onEnded={() => handleHeroVideoEnded("B")}
            aria-hidden="true"
          />
          <div className="ca-aurora" aria-hidden="true" />
          <div className="ca-hero-overlay" aria-hidden="true" />
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
                {tHub("heroV3.observerBadge")}
              </span>

              {/* 메인 사이트 전용 카피 — homeHero.*. /demo 와 컴포넌트는 공유하되
                  카피는 분리 (heroV3.* 는 demo 페이지가 그대로 사용).
                  사용자 결정 2026-05-13 PM: 골드 그라데이션을 첫 줄 ('학생과
                  상호작용하는') 에 적용. 둘째 줄 ('AI 교육영상') 은 다크 평문. */}
              <h1 id="landing-hero-title">
                <span className="ca-accent">{tHub("homeHero.headlineLead")}</span>
                <br />
                {tHub("homeHero.headlineAccent")}
              </h1>

              {/* 사용자 결정 2026-05-14: 서브카피는 3-line 구조로 명시적 줄바꿈.
                  데스크탑에선 세 문장이 시각적으로 분리되어 가독성이 올라가고,
                  모바일에서는 줄바꿈이 자연스럽게 잘려도 의미 단위가 보존된다.
                  서브태그 ('학생이 만나는 화면을 먼저 확인해보세요.') 는 새 카피
                  스펙에서 제외되어 본 페이지에서 렌더하지 않는다. */}
              <p className="ca-hero-sub">
                {tHub("heroV3.subtitleLine1")}
                <br />
                {tHub("heroV3.subtitleLine2")}
                <br />
                {tHub("heroV3.subtitleLine3")}
              </p>

              <div className="ca-hero-meta">
                <span className="ca-meta-chip">{tHub("heroV3.metaTime")}</span>
                <span className="ca-meta-chip">{tHub("heroV3.metaQuestions")}</span>
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
                  {tHub("heroV3.metaMobile")}
                </span>
              </div>

              <div className="ca-hero-actions">
                {/* "학생 화면 미리보기" — 사용자 결정 2026-05-14: 클릭 시
                    /demo 의 동일 hero 를 거치지 않고 곧장 학생 시청 화면
                    (ExperienceSection) 으로 진입한다. /demo 는 `?field=` 쿼리를
                    받으면 자동으로 해당 분야 세션을 시작하고 #demo-experience 로
                    스크롤한다 (frontend/src/app/demo/page.tsx 76-84). 기본 분야는
                    아래 ca-field-grid 의 첫 카드와 일치하도록 'social' 선택.
                    분야는 학생 화면 상단 ↺ "분야 바꾸기" 버튼으로 즉시 전환 가능. */}
                <Link
                  href="/demo?field=social"
                  className="ca-btn-primary"
                  data-testid="landing-hero-start"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M7 4.5v15a1 1 0 0 0 1.55.83l11-7.5a1 1 0 0 0 0-1.66l-11-7.5A1 1 0 0 0 7 4.5z" />
                  </svg>
                  {tHub("heroV3.primaryCta")}
                </Link>
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
                  {tHub("heroV3.secondaryCta")}
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
            </div>

            <HeroFlowStage labels={heroFlowLabels} />
          </div>
        </section>

        {/* 분야 선택 — 디자인의 fields 그대로. 클릭 시 /demo?field=X 로 라우팅.
            본 섹션이 메인 사이트의 마지막 콘텐츠 (사용자 결정 2026-05-13). */}
        <section
          id="landing-field-select"
          className="ca-fields"
          aria-labelledby="landing-field-heading"
        >
          <div className="ca-fields-inner">
            <div className="ca-fields-header">
              <div>
                <h2 className="ca-fields-title" id="landing-field-heading">
                  {tHub("demoFieldShowcase.title")}
                </h2>
                <p className="ca-fields-subtitle">
                  {tHub("demoFieldShowcase.subtitle")}
                </p>
              </div>
            </div>

            <div className="ca-field-grid">
              <FieldSelectCard field="social" onSelect={handleSelectField} />
              <FieldSelectCard field="natural" onSelect={handleSelectField} />
            </div>
          </div>
        </section>
      </div>

      {/* (Footer 는 LightMarketingShell 이 처리) */}
      <span hidden>{tCommon("common.footerCopyright")}</span>
    </LightMarketingShell>
  );
}
