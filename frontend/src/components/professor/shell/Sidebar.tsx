"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/contexts/I18nContext";
import type { CSSProperties, ReactNode } from "react";

/**
 * Professor v2 Sidebar — 220px, light surface.
 *
 * docs/planning/05-instructor-pages.md §2 의 "좌측 사이드바(220px)" 구조.
 * 그라데이션 SVG 아이콘 정책(icons.md) 에 따라 stroke 가 그라데이션. 활성 항목은
 * gold-soft 배경 + gold 텍스트, 비활성은 muted.
 *
 * docs/prototypes/05-studio-flow.extracted.html 의 좌측 slide-panel 카드 톤을
 * nav-item 패턴으로 옮긴 것.
 *
 * 후속 정리 ② 메모: 본 컴포넌트는 ui/* 와 중복이 아니라 순수 교수자 layout
 * 전용(220px nav 골격)이다. DEPLOYMENT_PROGRESS 가 shell 묶음으로 언급했으나
 * brand-dot/버튼/카드 같은 ui/* 표면이 없어 흡수 대상이 아님 — 그대로 유지.
 */

interface NavItem {
  href: string;
  labelKey: string;
  iconId: string;
  icon: ReactNode;
}

const navItems: NavItem[] = [
  {
    href: "/professor/dashboard",
    labelKey: "nav.dashboard",
    iconId: "ic-dashboard",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="url(#nav-grad-electric)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </svg>
    ),
  },
  {
    href: "/professor/studio",
    labelKey: "nav.studio",
    iconId: "ic-studio",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="url(#nav-grad-electric)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polygon points="6 4 20 12 6 20 6 4" />
      </svg>
    ),
  },
  {
    href: "/professor/lecture/new",
    labelKey: "nav.newLecture",
    iconId: "ic-newlecture",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="url(#nav-grad-electric)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="6" width="15" height="12" rx="2" />
        <polygon points="18 10 22 7 22 17 18 14" />
      </svg>
    ),
  },
  {
    href: "/professor/lectures",
    labelKey: "nav.library",
    iconId: "ic-library",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="url(#nav-grad-electric)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 6h14a2 2 0 0 1 2 2v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6z" />
        <path d="M3 6V4a1 1 0 0 1 1-1h5l2 3" />
      </svg>
    ),
  },
  {
    href: "/professor/inbox",
    labelKey: "nav.inbox",
    iconId: "ic-inbox",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="url(#nav-grad-electric)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    href: "/professor/analytics",
    labelKey: "nav.analytics",
    iconId: "ic-analytics",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="url(#nav-grad-electric)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <line x1="5" y1="19" x2="19" y2="19" />
        <rect x="5" y="13" width="3" height="6" />
        <rect x="10.5" y="9" width="3" height="10" />
        <rect x="16" y="5" width="3" height="14" />
      </svg>
    ),
  },
  {
    href: "/professor/learners",
    labelKey: "nav.learners",
    iconId: "ic-learners",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="url(#nav-grad-electric)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    href: "/professor/subscription",
    labelKey: "nav.subscription",
    iconId: "ic-subscription",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="url(#nav-grad-electric)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <line x1="2" y1="11" x2="22" y2="11" />
      </svg>
    ),
  },
];

const sidebarStyle: CSSProperties = {
  width: 220,
  flexShrink: 0,
  background: "var(--bg-sidebar)",
  borderRight: "1px solid var(--line)",
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
};

const sectionHeaderStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  color: "var(--text-faint)",
  padding: "16px 18px 8px",
};

export default function ProfessorSidebar() {
  const pathname = usePathname();
  const { t } = useI18n();

  const isActive = (href: string) =>
    pathname === href || pathname?.startsWith(href + "/");

  return (
    <aside style={sidebarStyle} aria-label={t("nav.lectureManage")}>
      <div style={sectionHeaderStyle}>{t("nav.lectureManage")}</div>
      <nav className="flex flex-col gap-0.5 px-3 pb-4">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="flex items-center gap-2.5 rounded-lg motion-safe:transition"
              style={{
                padding: "8px 12px",
                fontSize: 13,
                fontWeight: 500,
                color: active ? "var(--gold)" : "var(--text-muted)",
                background: active ? "var(--gold-soft)" : "transparent",
                textDecoration: "none",
              }}
              onMouseEnter={(e) => {
                if (active) return;
                e.currentTarget.style.background = "var(--bg-hover)";
                e.currentTarget.style.color = "var(--text)";
              }}
              onMouseLeave={(e) => {
                if (active) return;
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--text-muted)";
              }}
            >
              <span
                className="inline-flex shrink-0"
                style={{ width: 18, height: 18 }}
                aria-hidden="true"
              >
                {item.icon}
              </span>
              <span className="truncate">{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
