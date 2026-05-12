"use client";

import { useFeaturesHubI18n } from "./useFeaturesHubI18n";

/**
 * §3.1 Video-input-icon morph — PPT 슬라이드 ↔ 영상 재생 아이콘 사이의 3초 루프.
 *
 * 구현:
 *   - 단일 `<svg>` 안에 두 stage 그룹을 겹쳐두고 opacity 만 cross-fade. CSS `d:`
 *     keyframe 은 브라우저 호환성이 일관적이지 않아 모핑 효과를 opacity 교차로
 *     안전하게 재현. 1.5s 마다 stage 가 바뀌며 시각적으로는 PPT → ▶ → PPT 의
 *     자연스런 토글로 인지됨.
 *   - 둘 사이의 화살표는 별도 펄스 애니메이션 (`fhub-morph-arrow`) — 시선 이동
 *     유도용.
 *   - prefers-reduced-motion 환경에서는 영상 stage 만 정적으로 노출
 *     (featuresStyles.tsx 참조).
 *
 * 접근성: SVG 전체에 `role="img"` + i18n alt. 내부 그룹은 aria-hidden.
 */
export default function MorphIcon() {
  const { t } = useFeaturesHubI18n();

  return (
    <div className="relative flex items-center justify-center gap-6 sm:gap-10">
      {/* 좌: PPT slide */}
      <Stage
        label={t("morph.stagePpt")}
        className="fhub-morph-stage--ppt"
        ariaLabel={t("common.altSlide")}
      >
        <SlideShape />
      </Stage>

      {/* 가운데 화살표 */}
      <svg
        viewBox="0 0 32 32"
        className="fhub-morph-arrow w-8 h-8 text-[#B88308]"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M6 16 H24 M18 10 L24 16 L18 22"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* 우: video play icon */}
      <Stage
        label={t("morph.stageVideo")}
        className="fhub-morph-stage--video"
        ariaLabel={t("common.altPlay")}
      >
        <PlayShape />
      </Stage>

      {/* 전체 의미를 한 번에 묶어 SR 에 전달 */}
      <span className="sr-only" data-testid="features-morph-alt">
        {t("morph.altMorph")}
      </span>
    </div>
  );
}

function Stage({
  label,
  className,
  ariaLabel,
  children,
}: {
  label: string;
  className: string;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex flex-col items-center gap-2">
      <div
        className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-2xl border border-[rgba(10,10,10,0.08)] bg-[#FAFAF7] flex items-center justify-center overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]"
        role="img"
        aria-label={ariaLabel}
      >
        <span className={className}>{children}</span>
      </div>
      <span className="text-[11px] uppercase tracking-[0.18em] text-[rgba(10,10,10,0.50)] font-semibold">
        {label}
      </span>
    </div>
  );
}

function SlideShape() {
  // 슬라이드 형태: 외곽 사각형 + 내부 가로선 3줄. amber 톤으로 hint 처리.
  return (
    <svg
      viewBox="0 0 64 64"
      width="56"
      height="56"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="8"
        y="12"
        width="48"
        height="40"
        rx="4"
        fill="none"
        stroke="url(#fhub-grad-electric)"
        strokeWidth="2.4"
      />
      <line x1="14" y1="22" x2="40" y2="22" stroke="rgba(255,182,39,0.75)" strokeWidth="2" strokeLinecap="round" />
      <line x1="14" y1="32" x2="50" y2="32" stroke="rgba(255,182,39,0.5)" strokeWidth="2" strokeLinecap="round" />
      <line x1="14" y1="42" x2="34" y2="42" stroke="rgba(255,182,39,0.35)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PlayShape() {
  // 동그란 프레임 + 가운데 ▶ 삼각형.
  return (
    <svg
      viewBox="0 0 64 64"
      width="56"
      height="56"
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="32"
        cy="32"
        r="22"
        fill="none"
        stroke="url(#fhub-grad-electric)"
        strokeWidth="2.4"
      />
      <path d="M27 22 L46 32 L27 42 Z" fill="#FFB627" />
    </svg>
  );
}
