"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { BrandDot } from "@/components/ui";
import { useShell } from "./ShellContext";
import type { ReactNode } from "react";

/**
 * Professor v2 Topbar — 56px, light surface.
 *
 * **ui/* 와의 경계 (후속 정리 ②)**: 본 컴포넌트는 교수자 layout 전용
 * wrapper 다 — professor 영역 scoped 토큰(shell/tokens.ts, inline style)
 * 위에서만 렌더되며 ui/* 의 전역-토큰 + Tailwind 클래스 메커니즘과는
 * 의도적으로 분리 유지된다. 단 브랜드 마크는 canonical 단일화 대상이라
 * 손수 그리던 brand-dot 을 ui/BrandDot 으로 흡수했다 — professor 토큰의
 * --gold-bright/-deep 가 BrandDot 의 동명 변수와 동일값이라 그라데이션은
 * 그대로, glow 만 BrandDot 표준값(부드러움)으로 정규화된다.
 *
 * docs/prototypes/05-studio-flow.extracted.html §SCREEN 1~2 header 의
 * 시각 패턴을 옮긴 것:
 * - BrandDot (canonical gold 마크) + ClassAuto wordmark
 * - crumb-back (router.back, dashboard 에서는 숨김)
 * - 중앙: 페이지 제목 (또는 children 으로 title-input 등 커스터마이즈)
 * - 우측: saved chip (선택) + avatar-pill (initials + name)
 *
 * crumb-back 은 사용자 결정에 따라 router.back() 사용 (직전 페이지로).
 */
export interface ProfessorTopbarProps {
  /** 중앙에 표시할 페이지 제목. children 으로 더 복잡한 입력도 가능. */
  title?: string;
  /** 제목 자리에 임의의 노드 (studio 의 title-input 등). 있으면 title 무시. */
  centerSlot?: ReactNode;
  /**
   * "임시 저장됨" 등 우측 chip. 없으면 표시 안 함.
   * 정상 = success dot + bg-subtle (prototype §saved 스타일).
   */
  savedLabel?: string;
  /** 뒤로 가기 버튼 표시 여부. 기본 true (dashboard 페이지에서는 false 권장). */
  showBack?: boolean;
  /** crumb-back 의 라벨 (기본 "대시보드"). */
  backLabel?: string;
  /** crumb-back 클릭 핸들러. 미지정 시 router.back(). */
  onBack?: () => void;
}

export default function ProfessorTopbar({
  title,
  centerSlot,
  savedLabel,
  showBack = true,
  backLabel,
  onBack,
}: ProfessorTopbarProps) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { t } = useI18n();
  // 페이지가 ShellContext 로 끼운 중앙 노드(studio 의 제목 편집기 등).
  // centerSlot prop(레거시) 이 명시되면 그쪽을 우선한다.
  const shell = useShell();
  const resolvedCenter = centerSlot ?? shell?.centerSlot ?? null;

  const resolvedBackLabel = backLabel ?? t("nav.dashboard");
  const initial = user?.email?.charAt(0).toUpperCase() ?? "?";
  const displayName = user?.email?.split("@")[0] ?? "";

  const handleBack = () => {
    if (onBack) return onBack();
    router.back();
  };

  return (
    <header
      className="flex-shrink-0 flex items-center gap-4 px-5"
      style={{
        height: 56,
        background: "var(--bg-card)",
        borderBottom: "1px solid var(--line)",
      }}
    >
      {/* LEFT — brand + back crumb */}
      <div className="flex items-center gap-3.5 flex-shrink-0">
        <Link
          href="/"
          aria-label="ClassAuto"
          className="flex items-center gap-2"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: "-0.01em",
            color: "var(--text)",
            textDecoration: "none",
          }}
        >
          <BrandDot size={20} />
          ClassAuto
        </Link>
        {showBack && (
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-1.5 rounded-lg motion-safe:transition"
            style={{
              padding: "6px 10px",
              color: "var(--text-muted)",
              fontSize: 13,
              fontWeight: 500,
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-hover)";
              e.currentTarget.style.color = "var(--text)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
            {resolvedBackLabel}
          </button>
        )}
      </div>

      {/* CENTER — title / title-input */}
      <div className="flex-1 flex justify-center items-center gap-2.5 min-w-0">
        {resolvedCenter ? (
          resolvedCenter
        ) : (
          title && (
            <span
              className="truncate"
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--text)",
                maxWidth: 480,
              }}
            >
              {title}
            </span>
          )
        )}
        {savedLabel && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full"
            style={{
              fontSize: 12,
              color: "var(--text-subtle)",
              padding: "6px 10px",
              background: "var(--bg-subtle)",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: "var(--success)",
                boxShadow: "0 0 0 3px rgba(16, 185, 129, 0.18)",
              }}
            />
            {savedLabel}
          </span>
        )}
      </div>

      {/* RIGHT — avatar pill + logout */}
      <div className="flex items-center gap-2.5 flex-shrink-0">
        <button
          type="button"
          onClick={logout}
          className="text-xs rounded-lg motion-safe:transition"
          style={{
            padding: "5px 10px",
            color: "var(--text-muted)",
            background: "transparent",
            border: "1px solid var(--line)",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-hover)";
            e.currentTarget.style.color = "var(--text)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--text-muted)";
          }}
        >
          {t("common.logout")}
        </button>
        <div
          className="inline-flex items-center gap-2 rounded-full"
          style={{
            padding: "4px 12px 4px 4px",
            border: "1px solid var(--line)",
            background: "var(--bg-card)",
          }}
        >
          <span
            className="inline-grid place-items-center rounded-full"
            style={{
              width: 26,
              height: 26,
              background: "linear-gradient(135deg, #FFB627, #E89E0E)",
              color: "#0A0A0A",
              fontWeight: 800,
              fontSize: 11,
            }}
            aria-hidden="true"
          >
            {initial}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{displayName}</span>
        </div>
      </div>
    </header>
  );
}
