"use client";

/**
 * 그라데이션 SVG defs — 페이지당 1회만 마운트.
 *
 * docs/design-system/icons.md §3 의 6종 표준 그라데이션을 page 어딘가 한 번만
 * 정의해 두면 SVG 의 stroke/fill 에서 `url(#grad-violet)` 등으로 참조 가능.
 *
 * 메인 사이트 (라이트 베이스) 에서도 사용. 다크 베이스는 별도 alpha 조정 없이
 * 그대로 쓰되 stroke 두께와 opacity 만 호출자 측에서 조절한다.
 */
export default function IconDefs() {
  return (
    <svg
      width="0"
      height="0"
      style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="grad-violet" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#A78BFA" />
          <stop offset="100%" stopColor="#6366F1" />
        </linearGradient>
        <linearGradient id="grad-electric" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFB627" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>
        <linearGradient id="grad-cyan" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#22D3EE" />
          <stop offset="100%" stopColor="#0EA5E9" />
        </linearGradient>
        <linearGradient id="grad-pink" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F472B6" />
          <stop offset="100%" stopColor="#EC4899" />
        </linearGradient>
        <linearGradient id="grad-success" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#34D399" />
          <stop offset="100%" stopColor="#10B981" />
        </linearGradient>
        <linearGradient id="grad-warning" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F87171" />
          <stop offset="100%" stopColor="#EF4444" />
        </linearGradient>
      </defs>
    </svg>
  );
}
