"use client";

/**
 * Trust strip — 4-cell border-line grid (라이트 톤).
 *
 * 디자인 근거: docs/prototypes/04-demo-page.html.html (standalone, 2026-05-13)
 *
 * i18n 비의존 — / 와 /demo 가 동일 컴포넌트를 다른 카피로 재사용. 라벨 셋과
 * aria 라벨을 호출 측이 주입한다. 모바일 (<= 720px) 에서 2-col 폴드.
 */
export interface TrustStripLabels {
  ariaLabel: string;
  cells: ReadonlyArray<{ label: string; value: string }>;
}

export default function TrustStrip({ labels }: { labels: TrustStripLabels }) {
  return (
    <section
      className="relative px-4 sm:px-8 pb-20 z-[1]"
      aria-label={labels.ariaLabel}
    >
      <div className="ca-trust-grid">
        {labels.cells.map((cell, idx) => (
          <TrustCell
            key={cell.label}
            icon={ICON_BY_INDEX[idx] ?? ICON_BY_INDEX[0]}
            label={cell.label}
            value={cell.value}
          />
        ))}
      </div>
    </section>
  );
}

function TrustCell({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="ca-trust-cell">
      <div className="ca-trust-icon">{icon}</div>
      <span className="ca-trust-label">{label}</span>
      <span className="ca-trust-value num">{value}</span>
    </div>
  );
}

/** 4-셀 순서대로 매칭되는 아이콘 — 디자인 standalone 의 순서 그대로. */
const ICON_BY_INDEX: ReadonlyArray<React.ReactNode> = [
  <ShieldIcon key="shield" />,
  <PulseIcon key="pulse" />,
  <CardIcon key="card" />,
  <UserIcon key="user" />,
];

function ShieldIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="url(#ca-grad-violet)"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3l8 3v6c0 5-3.5 7.8-8 9-4.5-1.2-8-4-8-9V6l8-3z" />
    </svg>
  );
}

function PulseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="url(#ca-grad-electric)"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 13h4l2-7 4 14 2-7h6" />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="url(#ca-grad-cyan)"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M3 9h18" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="url(#ca-grad-pink)"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}
