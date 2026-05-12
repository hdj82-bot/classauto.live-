"use client";

/**
 * GradientDefs — 06 prototype 의 모든 그라데이션 stroke 아이콘이 참조하는
 * shared SVG <defs>. 페이지당 1회만 마운트한다 (StudentSurfaceLight /
 * PlayerSurfaceDark 내부에서 자동 마운트).
 *
 * id 는 글로벌 — 같은 페이지 안에서 두 번 마운트하면 id 충돌이 일어날 수
 * 있어 surface 컴포넌트가 단일 진실의 원천이 된다.
 *
 * 출처: docs/prototypes/06-student-flow.extracted.html (`<svg width="0" ...>`)
 */
export default function GradientDefs() {
  return (
    <svg
      width="0"
      height="0"
      style={{ position: "absolute", width: 0, height: 0 }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="ca-grad-violet" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#A78BFA" />
          <stop offset="100%" stopColor="#6366F1" />
        </linearGradient>
        <linearGradient id="ca-grad-electric" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFB627" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>
        <linearGradient id="ca-grad-cyan" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#22D3EE" />
          <stop offset="100%" stopColor="#0EA5E9" />
        </linearGradient>
        <linearGradient id="ca-grad-pink" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F472B6" />
          <stop offset="100%" stopColor="#EC4899" />
        </linearGradient>
        <linearGradient id="ca-grad-success" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#34D399" />
          <stop offset="100%" stopColor="#10B981" />
        </linearGradient>
      </defs>
    </svg>
  );
}
