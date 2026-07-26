"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useI18n } from "@/contexts/I18nContext";
import { feedbackApi, issuesApi } from "@/lib/api";

/**
 * 운영자 콘솔 셸 — 스펙 14 §E.
 *
 * 사이드바를 운영·품질·감시 3그룹으로 묶고, v1 잔재(`bg-gray-50`·`bg-gray-900`·
 * `indigo-600`)를 v2 토큰(라이트 베이지 + 골드)으로 전면 교체했다. 디자인 기준은
 * 프로토타입 08 이되 CSS 를 복붙하지 않고 `globals.css` 의 토큰 유틸리티를 쓴다.
 *
 * 사이드바는 스펙 §E 최종 구성 **9개**다. 이슈 인박스(`/admin/issues`)는 C 가 화면과
 * 함께 붙였다 — E 시점에 먼저 링크를 걸었으면 C 머지 전까지 404 였을 자리다.
 *
 * `/admin/users` 는 사이드바에서만 뺐다(라우트는 유지). "테스터 목록이 두 개"인
 * 게 문제였을 뿐이고, `/admin/beta` 모집단은 `instructor_rollup` 이
 * `role == professor` 로 고정해서 흡수하면 학생·admin 계정 관리 경로가 사라진다.
 * 도달 경로는 `/admin/beta` 행의 딥링크가 맡는다.
 */

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** 미처리 건수 배지. 0/undefined 면 표시하지 않는다. */
  badge?: number;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute allowedRoles={["admin"]} allowOwner>
      <AdminShell>{children}</AdminShell>
    </ProtectedRoute>
  );
}

function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const [openFeedback, setOpenFeedback] = useState<number>(0);
  const [newIssues, setNewIssues] = useState<number>(0);

  // 미처리 피드백·미확인 이슈 배지. 상태 토글은 각 화면에서 일어나므로 화면 이동마다
  // 다시 센다(스펙 §E "개요의 카드와 같은 소스").
  //
  // 이슈 배지는 **패스 수**다(행 수가 아니라) — 목록이 강의+패스 단위로 묶여 있어서
  // 행을 세면 슬라이드 수만큼 부풀어 배지와 목록이 어긋난다. 서버가 준 counts.new 를
  // 그대로 쓴다.
  //
  // 두 배지는 독립적으로 실패할 수 있어야 한다. 하나로 묶어 await 하면 이슈 조회가
  // 죽었을 때 피드백 배지까지 0 이 된다.
  const loadBadges = useCallback(async () => {
    try {
      const { data } = await feedbackApi.adminList({ status: "open" });
      setOpenFeedback(data.total ?? 0);
    } catch {
      // 배지는 보조 정보다. 실패해도 콘솔 자체는 그대로 쓸 수 있어야 하므로 조용히 0.
      setOpenFeedback(0);
    }
    try {
      const { data } = await issuesApi.list({ since: "7d", limit: 1 });
      setNewIssues(data.counts?.new ?? 0);
    } catch {
      setNewIssues(0);
    }
  }, []);

  // rAF 로 다음 프레임에 비동기 실행 — effect 동기 경로에서 setState 하는
  // 함수를 직접 부르면 react-hooks/set-state-in-effect 가 막는다(레포 표준 회피책).
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      void loadBadges();
    });
    return () => cancelAnimationFrame(raf);
  }, [loadBadges, pathname]);

  const groups: { title: string; items: NavItem[] }[] = [
    {
      title: t("admin.navGroupOps"),
      items: [
        { href: "/admin", label: t("admin.navDashboard"), icon: <IconOverview /> },
        { href: "/admin/invites", label: t("admin.navInvites"), icon: <IconInvite /> },
        { href: "/admin/beta", label: t("admin.navBeta"), icon: <IconUsers /> },
      ],
    },
    {
      title: t("admin.navGroupQuality"),
      items: [
        {
          href: "/admin/issues",
          label: t("admin.navIssues"),
          icon: <IconIssue />,
          badge: newIssues,
        },
        {
          href: "/admin/feedback",
          label: t("admin.navFeedback"),
          icon: <IconFeedback />,
          badge: openFeedback,
        },
        {
          href: "/admin/applications",
          label: t("admin.navApplications"),
          icon: <IconDocument />,
        },
      ],
    },
    {
      title: t("admin.navGroupWatch"),
      items: [
        { href: "/admin/costs", label: t("admin.navCosts"), icon: <IconCost /> },
        { href: "/admin/audit", label: t("admin.navAudit"), icon: <IconClock /> },
        { href: "/admin/system", label: t("admin.navSystem"), icon: <IconServer /> },
      ],
    },
  ];

  return (
    // 모바일: 세로 스택(상단 가로 내비) / md+: 좌측 고정 사이드바.
    // 종전 w-64 고정 사이드바가 폰에서 256px 를 차지해 본문이 ~119px 로 짓눌렸다.
    <div className="flex min-h-screen flex-col bg-bg md:flex-row">
      <aside className="w-full shrink-0 border-line bg-bg-subtle md:sticky md:top-0 md:h-screen md:w-[236px] md:border-r">
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-center gap-2.5">
            <BrandMark />
            <span className="font-display text-base font-extrabold tracking-tight text-text">
              ClassAuto
            </span>
          </div>
          <p className="mt-1.5 text-[11px] tracking-wide text-text-subtle">
            {t("admin.subtitle")} · <span className="han">管理</span>
          </p>
        </div>

        {/* 모바일은 가로 스크롤 탭(그룹 라벨 숨김), md+ 는 그룹별 세로 목록.
            display:contents 로 모바일에선 그룹 래퍼가 사라져 한 줄로 흐른다. */}
        <nav
          className="flex flex-row gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:gap-0 md:overflow-visible md:pb-0"
          aria-label={t("admin.subtitle")}
        >
          {groups.map((group) => (
            <div key={group.title} className="contents md:block">
              <p className="hidden px-2 pt-3.5 pb-1.5 text-[10px] font-bold tracking-[0.09em] text-text-faint uppercase md:block">
                {group.title}
              </p>
              {group.items.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={`relative flex shrink-0 items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-[13px] font-medium whitespace-nowrap transition ${
                      isActive
                        ? "bg-gold/10 font-semibold text-gold-on-light"
                        : "text-text-muted hover:bg-bg-hover hover:text-text"
                    }`}
                  >
                    {/* 활성 표시 막대 — md+ 세로 목록에서만. */}
                    {isActive && (
                      <span
                        aria-hidden
                        className="absolute top-1.5 bottom-1.5 -left-3 hidden w-[3px] rounded-r-[3px] bg-gold-deep md:block"
                      />
                    )}
                    {item.icon}
                    {item.label}
                    {item.badge ? (
                      <span
                        className={`ml-auto flex h-[19px] min-w-[19px] items-center justify-center rounded-[10px] px-1.5 text-[10px] font-bold tabular-nums text-white ${
                          isActive ? "bg-gold-deep" : "bg-warning"
                        }`}
                      >
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      <main className="min-w-0 flex-1 overflow-auto p-6 md:p-7">{children}</main>
    </div>
  );
}

/* ── 아이콘 — 프로토타입 08 과 같은 24 그리드 line SVG. 같은 의미는 같은 SVG
      재사용(icons.md v2). 브랜드 마크만 골드 그라데이션, 내비는 currentColor. ── */

function BrandMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="admin-brand-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFB627" />
          <stop offset="100%" stopColor="#E89E0E" />
        </linearGradient>
      </defs>
      <rect
        x="2.5"
        y="4"
        width="19"
        height="13.5"
        rx="2.6"
        stroke="url(#admin-brand-gold)"
        strokeWidth="1.7"
      />
      <path
        d="M8 20.5h8"
        stroke="url(#admin-brand-gold)"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path d="M10 8.6l4.2 2.6L10 13.8V8.6z" fill="url(#admin-brand-gold)" />
    </svg>
  );
}

function NavIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

function IconOverview() {
  return (
    <NavIcon>
      <path
        d="M4 13h6V4H4v9zm10 7h6v-9h-6v9zM4 20h6v-4H4v4zM14 8h6V4h-6v4z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </NavIcon>
  );
}

function IconInvite() {
  return (
    <NavIcon>
      <rect x="3" y="5" width="18" height="14" rx="2.4" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3.6 6.6l8.4 6 8.4-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </NavIcon>
  );
}

function IconUsers() {
  return (
    <NavIcon>
      <path
        d="M16.5 20v-1.8a3.4 3.4 0 00-3.4-3.4H6.9A3.4 3.4 0 003.5 18.2V20"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="10" cy="7.6" r="3.4" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M20.5 20v-1.8a3.4 3.4 0 00-2.6-3.3M15.4 4.4a3.4 3.4 0 010 6.4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </NavIcon>
  );
}

function IconIssue() {
  // 경고 삼각형 — 프로토타입 08 의 이슈 내비 아이콘. 개요 카드의 'warn' 과 같은 의미라
  // 같은 SVG 를 쓴다(icons.md v2 — 같은 의미는 같은 아이콘).
  return (
    <NavIcon>
      <path
        d="M12 4.3L21 19.4H3L12 4.3z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M12 10v3.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M12 16.5h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </NavIcon>
  );
}

function IconFeedback() {
  return (
    <NavIcon>
      <path
        d="M20.5 11.6a7.6 7.6 0 01-8.2 7.6c-.9 0-1.8-.2-2.6-.4L4 20.5l1.7-5.4A7.4 7.4 0 014.9 11.6a7.6 7.6 0 017.6-7.6h.5a7.6 7.6 0 017.5 7.6z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </NavIcon>
  );
}

function IconDocument() {
  return (
    <NavIcon>
      <path
        d="M14 3.2H7a2 2 0 00-2 2v13.6a2 2 0 002 2h10a2 2 0 002-2V8.2l-5-5z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M14 3.2v5h5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </NavIcon>
  );
}

function IconCost() {
  return (
    <NavIcon>
      <path
        d="M12 2.8v18.4M16.3 6.4H9.9a2.9 2.9 0 000 5.8h4.2a2.9 2.9 0 010 5.8H7.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </NavIcon>
  );
}

function IconClock() {
  return (
    <NavIcon>
      <path
        d="M12 7.6v4.8l3.2 1.9"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
    </NavIcon>
  );
}

function IconServer() {
  return (
    <NavIcon>
      <rect x="3" y="3.6" width="18" height="7" rx="1.9" stroke="currentColor" strokeWidth="1.7" />
      <rect x="3" y="13.4" width="18" height="7" rx="1.9" stroke="currentColor" strokeWidth="1.7" />
      <path d="M7 7.1h.01M7 16.9h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </NavIcon>
  );
}
