"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { useOptionalAuth } from "@/contexts/AuthContext";
import { canSeeAnalyticsPro } from "@/lib/analyticsProAccess";
import { canManageInvites } from "@/lib/ownerAccess";
import { fetchProfessorData } from "@/lib/professorData";
import type { CSSProperties, MouseEvent, ReactNode } from "react";

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

/**
 * "강의 영상 생성" 메뉴의 기본 목적지 = 영상 제작 마법사 진입(Step 1) 페이지.
 * 클릭 시 목적지 해석 우선순위:
 *   1) 현재 URL 에 `?lecture={id}` 가 있으면(예: 제작 화면에서 "페르소나 변경"으로
 *      넘어온 아바타 페이지) 바로 그 강의의 제작 화면으로 복귀 — 작업 중이던 정확한
 *      강의를 보존한다.
 *   2) 없으면 진행 중 강의를 추정해 이어서 이동(resolveStudioContinueHref).
 *   3) 그것도 없으면 진입 페이지(Step 1)로 폴백.
 */
const STUDIO_HREF = "/professor/studio";

/** 진행 중 강의 판별/정렬에 필요한 최소 필드 (GET /api/courses/{id}/lectures). */
interface LectureLite {
  id: string;
  is_published: boolean;
  video_url?: string | null;
  pipeline_task_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

/**
 * 가장 최근에 작업한 "제작 중" 강의의 제작 화면 경로를 해석한다.
 *
 * "제작 중" 기준은 LectureCard / 보관함의 `isProduction` 과 동일:
 * 발행 안 됐고 (파이프라인이 돌았거나 아직 영상이 없는) 강의.
 * 최신순(updated_at → created_at)으로 가장 위를 골라 마법사
 * `/professor/studio/{id}` 로 이어서 진행한다. 없으면 진입 페이지로 폴백.
 *
 * 강좌·강의 목록은 공유 캐시(fetchProfessorData)에서 받는다 — 다른 교수자
 * 페이지가 이미 로드해 두었으면 네트워크 없이 즉시 해석된다.
 */
async function resolveStudioContinueHref(): Promise<string> {
  try {
    const { lectures } = await fetchProfessorData<LectureLite>();
    const ts = (l: LectureLite) =>
      Date.parse(l.updated_at || l.created_at || "") || 0;
    const inProgress = lectures
      .filter(
        (l) =>
          !l.is_published && (Boolean(l.pipeline_task_id) || !l.video_url),
      )
      .sort((a, b) => ts(b) - ts(a));
    return inProgress.length > 0
      ? `${STUDIO_HREF}/${inProgress[0].id}`
      : STUDIO_HREF;
  } catch {
    return STUDIO_HREF;
  }
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
    href: STUDIO_HREF,
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
    href: "/professor/analytics-pro",
    labelKey: "nav.analyticsPro",
    iconId: "ic-analytics-pro",
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
        <path d="M12 2a10 10 0 1 0 10 10" />
        <path d="M12 12 7 7" />
        <path d="M12 6v6h6" />
      </svg>
    ),
  },
  {
    // 계정주(운영자) 전용 — 베타테스터 초대 링크 발급/관리. canManageInvites 로 노출 제어.
    href: "/owner/invites",
    labelKey: "nav.betaInvites",
    iconId: "ic-invite",
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
        <path d="M4 4h16v12H5.2L4 17.2V4z" />
        <path d="M8 9h8" />
        <path d="M8 12h5" />
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const auth = useOptionalAuth();
  // "강의 영상 생성" 클릭 → 진행 중 강의 해석 중 표시(중복 클릭 방지 + 시각 피드백).
  const [studioResolving, setStudioResolving] = useState(false);

  // 학습 분석 PRO(실기능)는 계정주 2계정에만, 베타 초대는 계정주(ADMIN_EMAILS)에게만
  // 노출 — 베타테스터에겐 두 메뉴를 숨긴다. 실제 접근 차단은 백엔드(require_analytics_pro·
  // require_owner)가 담당하며 이 필터는 진입점 노출 제어다.
  const email = auth?.user?.email;
  const visibleNavItems = navItems.filter((it) => {
    if (it.href === "/professor/analytics-pro") return canSeeAnalyticsPro(email);
    if (it.href === "/owner/invites") return canManageInvites(email);
    return true;
  });

  const isActive = (href: string) =>
    pathname === href || pathname?.startsWith(href + "/");

  // "강의 영상 생성" 클릭: 진행 중 강의가 있으면 그 제작 화면으로 바로 이어서 이동.
  // Cmd/Ctrl/보조 버튼 클릭은 기본 동작(진입 페이지를 새 탭에 열기)을 그대로 둔다.
  const handleStudioNav = async (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }
    e.preventDefault();
    if (studioResolving) return;
    // 현재 페이지가 특정 강의 컨텍스트(`?lecture={id}`)를 들고 있으면 그 강의의
    // 제작 화면으로 정확히 복귀한다. 아바타 페이지에서 "페르소나 변경"으로 넘어온
    // 뒤 다시 "강의 영상 생성"을 눌렀을 때 작업 중이던 강의가 사라지지 않게 한다.
    const lectureId = searchParams?.get("lecture");
    if (lectureId) {
      router.push(`${STUDIO_HREF}/${lectureId}`);
      return;
    }
    setStudioResolving(true);
    try {
      router.push(await resolveStudioContinueHref());
    } finally {
      setStudioResolving(false);
    }
  };

  return (
    <aside style={sidebarStyle} aria-label={t("nav.lectureManage")}>
      <div style={sectionHeaderStyle}>{t("nav.lectureManage")}</div>
      <nav className="flex flex-col gap-0.5 px-3 pb-4">
        {visibleNavItems.map((item) => {
          const active = isActive(item.href);
          const isStudio = item.href === STUDIO_HREF;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={isStudio ? handleStudioNav : undefined}
              aria-current={active ? "page" : undefined}
              aria-busy={isStudio && studioResolving ? true : undefined}
              className="flex items-center gap-2.5 rounded-lg motion-safe:transition"
              style={{
                padding: "8px 12px",
                fontSize: 13,
                fontWeight: 500,
                color: active ? "var(--gold)" : "var(--text-muted)",
                background: active ? "var(--gold-soft)" : "transparent",
                textDecoration: "none",
                opacity: isStudio && studioResolving ? 0.6 : undefined,
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
