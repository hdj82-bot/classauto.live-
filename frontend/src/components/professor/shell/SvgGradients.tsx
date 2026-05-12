/**
 * 그라데이션 SVG 정의 — `<svg>` 의 `<defs>` 안에 들어가는 공용 그라데이션 ID 집합.
 *
 * docs/design-system/icons.md (옵션 C: 그라데이션 SVG 통일) 에 따라 stroke /
 * fill 에 `url(#id)` 형태로 참조. 페이지마다 다시 정의하지 않도록 AppShell 의
 * 0×0 SVG 안에 한 번만 박는다 (prototype 1681-1703 행 패턴과 동일).
 *
 * 다른 컴포넌트(Topbar, Sidebar, dashboard 카드, gen-modal 등)는 이 ID 만 참조.
 */
export default function ProfessorSvgGradients() {
  return (
    <svg
      width={0}
      height={0}
      style={{ position: "absolute", width: 0, height: 0, pointerEvents: "none" }}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* Sidebar / 일반 아이콘 (gold) */}
        <linearGradient id="nav-grad-electric" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFB627" />
          <stop offset="100%" stopColor="#E89E0E" />
        </linearGradient>
        {/* Studio / 보조 그라데이션 (violet) */}
        <linearGradient id="grad-violet" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#A78BFA" />
          <stop offset="100%" stopColor="#6366F1" />
        </linearGradient>
        {/* Electric gold — 명도 변화에 강함 (fill 용) */}
        <linearGradient id="grad-electric" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFB627" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>
        {/* Cyan — Q&A · 분석 보조 */}
        <linearGradient id="grad-cyan" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22D3EE" />
          <stop offset="100%" stopColor="#0EA5E9" />
        </linearGradient>
        {/* Pink — 학습자 보조 */}
        <linearGradient id="grad-pink" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F472B6" />
          <stop offset="100%" stopColor="#EC4899" />
        </linearGradient>
        {/* Success — 완료·체크 */}
        <linearGradient id="grad-success" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#34D399" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
        {/* Coin — 활동·시간 (전체 시간/일정) */}
        <linearGradient id="grad-coin" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFC74D" />
          <stop offset="55%" stopColor="#FFB627" />
          <stop offset="100%" stopColor="#B88308" />
        </linearGradient>
      </defs>
    </svg>
  );
}
