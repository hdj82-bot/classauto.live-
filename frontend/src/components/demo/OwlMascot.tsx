"use client";

/**
 * 올빼미 마스코트 (회갈색 단색, 미니멀 도형).
 *
 * docs/design-system/mascot.md Section 3 참조.
 * - 학습자 영역에서만 등장 (집중 경고, 인터스티셜 퀴즈, demo CTA)
 * - 색상: --mascot-base #6B5B47 / --mascot-light #A89678 / 부리 #D4923A
 *
 * Demo 페이지에서는 CTA 모달 등장 시 부드럽게 페이드인 — 체험 중에는
 * 등장하지 않는다.
 */
export default function OwlMascot({
  size = 96,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      role="img"
      aria-label="ClassAuto 올빼미 마스코트"
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className={className}
    >
      <defs>
        <radialGradient id="owl-body" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#A89678" />
          <stop offset="100%" stopColor="#6B5B47" />
        </radialGradient>
      </defs>

      {/* 몸통 + 머리 */}
      <path
        d="M30 60 Q30 24 60 24 Q90 24 90 60 L90 92 Q90 104 78 104 L42 104 Q30 104 30 92 Z"
        fill="url(#owl-body)"
      />

      {/* 가슴 라이트 영역 */}
      <ellipse cx="60" cy="80" rx="20" ry="22" fill="#A89678" opacity="0.6" />

      {/* 귀깃 */}
      <path d="M36 32 L40 22 L46 32 Z" fill="#6B5B47" />
      <path d="M84 32 L80 22 L74 32 Z" fill="#6B5B47" />

      {/* 눈 흰자 */}
      <circle cx="48" cy="52" r="11" fill="#F5EFE3" />
      <circle cx="72" cy="52" r="11" fill="#F5EFE3" />

      {/* 눈동자 */}
      <circle cx="48" cy="53" r="5" fill="#1A1A1A" />
      <circle cx="72" cy="53" r="5" fill="#1A1A1A" />
      <circle cx="49.5" cy="51" r="1.6" fill="#FFFFFF" />
      <circle cx="73.5" cy="51" r="1.6" fill="#FFFFFF" />

      {/* 부리 */}
      <path d="M56 64 L64 64 L60 72 Z" fill="#D4923A" />
    </svg>
  );
}
