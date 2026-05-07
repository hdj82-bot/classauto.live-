"use client";

import { useEffect, useRef } from "react";
import { useFeaturesHubI18n } from "./useFeaturesHubI18n";

/**
 * §3.4 Isometric 그리드 패럴랙스 — 페이지 스크롤 1/8 속도로 따라움직임.
 *
 * 구현:
 *   - 컨테이너 안에 데이터 시각화 표면이 될 SVG 한 장. 격자 + 4종(시그널) 점.
 *   - 스크롤 이벤트는 `requestAnimationFrame` throttle (Frame 당 1회) — 16ms
 *     이상 간격으로만 transform 갱신. layout 변경 없는 GPU 가속(`translate3d`).
 *   - 스크롤 시 element 의 `getBoundingClientRect().top` 을 기준으로 카드 안
 *     중앙선 대비 `delta / 8` 만큼 Y 이동. 외부 페이지 위치와 무관하게 카드가
 *     "약간 살아있는" 느낌을 줌 (페이지 단위로 측정하면 카드 들어왔을 때
 *     이미 큰 offset 누적되는 문제 회피).
 *   - prefers-reduced-motion 환경에서 transform 미적용 (`featuresStyles.tsx`
 *     의 `.fhub-iso { transform: none !important; }` 미디어 블록).
 *
 * 접근성: 데이터 시각화 의미를 한 줄로 SR 전달 (`role="img"` + alt 라벨).
 *   순수 장식적 격자 라인은 aria-hidden.
 */
export default function IsoGrid() {
  const { t } = useFeaturesHubI18n();
  const wrapRef = useRef<HTMLDivElement>(null);
  const isoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const wrap = wrapRef.current;
    const iso = isoRef.current;
    if (!wrap || !iso) return;

    let pending = false;
    const update = () => {
      pending = false;
      const rect = wrap.getBoundingClientRect();
      const viewportH = window.innerHeight || 1;
      // -1 (위로 막 빠져나갈 때) ~ +1 (아래로 막 들어올 때)
      const center = (rect.top + rect.height / 2) - viewportH / 2;
      const offset = -center / 8;
      iso.style.transform = `translate3d(0, ${offset.toFixed(2)}px, 0)`;
    };

    const onScroll = () => {
      if (pending) return;
      pending = true;
      window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      data-testid="features-iso"
      className="relative rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent overflow-hidden"
      role="img"
      aria-label={t("iso.altGrid")}
    >
      {/* Title block — sits above the grid */}
      <div className="relative z-10 px-6 sm:px-10 pt-8 pb-32">
        <p className="text-[11px] uppercase tracking-[0.18em] text-amber-400/80 mb-3 font-semibold">
          {t("iso.eyebrow")}
        </p>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight max-w-xl">
          {t("iso.title")}
        </h2>
        <p className="mt-3 text-sm sm:text-base text-white/60 max-w-xl leading-relaxed">
          {t("iso.subtitle")}
        </p>
      </div>

      {/* Iso grid — parallaxed via transform */}
      <div
        ref={isoRef}
        className="fhub-iso pointer-events-none absolute inset-x-0 bottom-0"
        aria-hidden="true"
        style={{ transform: "translate3d(0,0,0)" }}
      >
        <svg
          viewBox="0 0 800 360"
          className="w-full h-[280px] sm:h-[360px] block"
          preserveAspectRatio="xMidYMax slice"
        >
          {/* Iso grid lines */}
          <g stroke="rgba(255,255,255,0.08)" strokeWidth="1">
            {[...Array(14)].map((_, i) => (
              <line
                key={`gx-${i}`}
                x1={-200 + i * 90}
                y1={0}
                x2={400 + i * 90}
                y2={360}
              />
            ))}
            {[...Array(14)].map((_, i) => (
              <line
                key={`gy-${i}`}
                x1={1000 - i * 90}
                y1={0}
                x2={400 - i * 90}
                y2={360}
              />
            ))}
          </g>

          {/* 4 signals — each cluster placed on a different grid cell */}
          <g>
            <circle cx="180" cy="240" r="28" fill="url(#fhub-grad-electric)" opacity="0.85" />
            <circle cx="180" cy="240" r="44" fill="rgba(255,182,39,0.18)" />
            <text x="180" y="244" textAnchor="middle" fill="#0A0A0A" fontSize="11" fontWeight="700">
              82%
            </text>
          </g>
          <g>
            <circle cx="360" cy="190" r="22" fill="url(#fhub-grad-violet)" opacity="0.85" />
            <circle cx="360" cy="190" r="36" fill="rgba(167,139,250,0.16)" />
            <text x="360" y="194" textAnchor="middle" fill="#0A0A0A" fontSize="10" fontWeight="700">
              74%
            </text>
          </g>
          <g>
            <circle cx="540" cy="220" r="26" fill="url(#fhub-grad-cyan)" opacity="0.85" />
            <circle cx="540" cy="220" r="40" fill="rgba(34,211,238,0.16)" />
            <text x="540" y="224" textAnchor="middle" fill="#0A0A0A" fontSize="10" fontWeight="700">
              91%
            </text>
          </g>
          <g>
            <circle cx="680" cy="160" r="20" fill="url(#fhub-grad-pink)" opacity="0.85" />
            <circle cx="680" cy="160" r="34" fill="rgba(244,114,182,0.16)" />
            <text x="680" y="164" textAnchor="middle" fill="#0A0A0A" fontSize="10" fontWeight="700">
              $46
            </text>
          </g>
        </svg>
      </div>
    </div>
  );
}
