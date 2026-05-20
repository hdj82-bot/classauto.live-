"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import {
  PageContainer,
  PageHeader,
  Card,
  tabularStyle,
  displayStyle,
} from "@/components/professor/shell";

interface UsageData {
  plan: string;
  monthly_limit: number;
  used: number;
  remaining: number;
  period: string;
}

/**
 * 구독 관리 페이지 — 2026 베타 모드.
 *
 * 사용자 결정 (2026-05-20):
 *  - 베타 기간 동안 가격 표기·업그레이드/다운그레이드·Stripe 결제 흐름을 모두
 *    비활성화한다. 학계 무료 Pro 정책만 안내한다.
 *  - 좌측 nav 의 진입점은 다른 PR (창 1) 에서 제거되지만, 본 페이지는 직접 URL
 *    접근(예: 기존 부킹마크) 시 살아있어야 한다. 따라서 라우트는 유지하고
 *    UI 만 베타 모드로 차분하게 정리한다.
 *  - 사용량 카드(편수 단위)는 한도 투명성 정책(`01-pricing-policy.md` §1.3) 에
 *    부합하므로 유지한다. 사용량 fetch 실패는 토스트로만 알리고 페이지 자체는
 *    렌더한다.
 *
 * 베타 종료 후: git 이력의 이전 버전을 참고해 PLANS 카드·Stripe checkout 흐름을
 * 되살리면 된다.
 */
export default function SubscriptionPage() {
  const { toast } = useToast();
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: u } = await api.get("/api/v1/subscription/usage");
        if (cancelled) return;
        setUsage(u);
      } catch {
        if (!cancelled) toast("사용량 정보를 불러오지 못했습니다.", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  if (loading) return <LoadingSpinner fullScreen label="구독 정보 불러오는 중..." />;

  const usePct = usage
    ? Math.min((usage.used / Math.max(usage.monthly_limit, 1)) * 100, 100)
    : 0;
  const warn = usePct >= 80;

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="결제 · 구독"
        title="구독 관리"
        subtitle="2026 베타 기간 — 대학 교수자에게 Pro 기능 전체가 무료로 제공됩니다."
      />

      {/* 베타 안내 카드 */}
      <Card
        padding={28}
        radius={16}
        style={{
          marginBottom: 24,
          background: "var(--gold-soft)",
          borderColor: "var(--gold-medium)",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--gold)",
          }}
        >
          2026 베타 — 학계 무료 Pro
        </p>
        <h2
          style={{
            ...displayStyle,
            margin: "8px 0 12px",
            fontSize: 20,
            fontWeight: 700,
            color: "var(--text)",
          }}
        >
          베타 기간 동안 결제가 발생하지 않습니다
        </h2>
        <p
          style={{
            margin: "0 0 8px",
            fontSize: 13.5,
            lineHeight: 1.7,
            color: "var(--text-muted)",
          }}
        >
          ClassAuto 는 현재 Phase 2 베타 단계로, 대학 교수자에게 Pro 기능 전체를
          무료로 제공합니다. 학교 이메일·소속 확인을 거친 베타 신청이 승인되면
          Pro 한도(월 영상 20편 · 활성 학습자 150명)와 모든 부가 기능이 자동으로
          활성화됩니다.
        </p>
        <p
          style={{
            margin: "0 0 16px",
            fontSize: 13.5,
            lineHeight: 1.7,
            color: "var(--text-muted)",
          }}
        >
          정식 출시 후의 요금은 베타 종료 시점에 사용자 피드백을 반영해
          결정합니다. 그 전까지는 가격을 별도로 표시하지 않으며, 업그레이드 ·
          다운그레이드 · Stripe 결제 흐름은 비활성화되어 있습니다.
        </p>
        <Link
          href="/pricing"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12.5,
            fontWeight: 600,
            color: "var(--gold)",
            textDecoration: "none",
          }}
        >
          공개 요금 페이지에서 플랜·기능 비교 보기 →
        </Link>
      </Card>

      {/* 사용량 카드 — 한도 투명성 (편수 단위) */}
      {usage && (
        <Card padding={24} radius={16} style={{ marginBottom: 24 }}>
          <div className="flex items-center justify-between mb-3">
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text)",
              }}
            >
              이번 달 사용량 ({usage.period})
            </span>
            <span
              style={{
                ...tabularStyle,
                fontSize: 13,
                color: "var(--text-subtle)",
              }}
            >
              {usage.used} / {usage.monthly_limit}편
            </span>
          </div>
          <div
            style={{
              background: "var(--bg-subtle)",
              borderRadius: 999,
              height: 10,
              border: "1px solid var(--line)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${usePct}%`,
                borderRadius: 999,
                background: warn
                  ? "linear-gradient(90deg, #FFB627 0%, #EF4444 100%)"
                  : "linear-gradient(90deg, #FFB627 0%, #E89E0E 100%)",
                transition: "width 800ms var(--ease-out)",
              }}
              aria-hidden="true"
            />
          </div>
          <p
            style={{
              ...tabularStyle,
              margin: "8px 0 0",
              fontSize: 11.5,
              color: "var(--text-subtle)",
            }}
          >
            남은 횟수: {usage.remaining}편
          </p>
        </Card>
      )}

      {/* 결제 비활성 안내 */}
      <Card padding={20} radius={14}>
        <p
          style={{
            margin: 0,
            fontSize: 12.5,
            lineHeight: 1.6,
            color: "var(--text-subtle)",
          }}
        >
          결제 수단·청구 내역 관리는 정식 출시 후 본 페이지에서 다시 제공됩니다.
          그 전 문의는 hello@classauto.live 로 부탁드립니다.
        </p>
      </Card>
    </PageContainer>
  );
}
