"use client";

import { useCallback, useEffect, useState } from "react";
import { api, isStripeCheckoutUrl } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import Modal from "@/components/ui/Modal";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import {
  PageContainer,
  PageHeader,
  PrimaryButton,
  Card,
  tabularStyle,
  displayStyle,
} from "@/components/professor/shell";

interface SubscriptionData {
  user_id: string;
  plan: string;
  monthly_limit: number;
}
interface UsageData {
  plan: string;
  monthly_limit: number;
  used: number;
  remaining: number;
  period: string;
}

/**
 * 구독 관리 페이지 — v2 라이트 + 골드.
 *
 * planning/05 §9 (/account/billing) 의 규정: ₩ 가격 표시는 허용 (구독료지
 * 영상 생성 비용이 아님). 단 영상 1편 원가 표시는 여전히 금지.
 *
 * 플랜 카드 3개 (Free / Basic / Pro) — 현재 플랜은 gold-bright 테두리 + 사용
 * 중 배지. 다른 플랜은 PrimaryButton 으로 업그레이드/다운그레이드.
 */
const PLANS = [
  {
    name: "FREE",
    label: "무료",
    limit: 2,
    price: "무료",
    features: ["월 2편 렌더링", "기본 Q&A", "기본 대시보드"],
  },
  {
    name: "BASIC",
    label: "베이직",
    limit: 10,
    price: "₩29,000/월",
    features: ["월 10편 렌더링", "고급 Q&A", "상세 대시보드", "번역 지원"],
  },
  {
    name: "PRO",
    label: "프로",
    limit: 20,
    price: "₩59,000/월",
    features: [
      "월 20편 렌더링",
      "무제한 Q&A",
      "전체 분석",
      "우선 렌더링",
      "번역 지원",
    ],
  },
];

export default function SubscriptionPage() {
  const { toast } = useToast();
  const [sub, setSub] = useState<SubscriptionData | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [changing, setChanging] = useState(false);
  const [confirmPlan, setConfirmPlan] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [{ data: s }, { data: u }] = await Promise.all([
        api.get("/api/v1/subscription"),
        api.get("/api/v1/subscription/usage"),
      ]);
      setSub(s);
      setUsage(u);
      return true;
    } catch {
      toast("구독 정보를 불러오지 못했습니다.", "error");
      return false;
    }
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ data: s }, { data: u }] = await Promise.all([
          api.get("/api/v1/subscription"),
          api.get("/api/v1/subscription/usage"),
        ]);
        if (cancelled) return;
        setSub(s);
        setUsage(u);
      } catch {
        if (!cancelled) toast("구독 정보를 불러오지 못했습니다.", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const handleChangePlan = async () => {
    if (!confirmPlan) return;
    setChanging(true);
    try {
      if (confirmPlan === "FREE") {
        await api.post(`/api/v1/subscription?plan=FREE`);
        await fetchData();
        toast("무료 플랜으로 변경되었습니다.", "success");
        setConfirmPlan(null);
      } else {
        const { data } = await api.post(
          `/api/v1/payment/checkout?plan=${confirmPlan}`,
        );
        if (!isStripeCheckoutUrl(data?.checkout_url)) {
          toast("결제 페이지 주소가 올바르지 않습니다.", "error");
          setChanging(false);
          setConfirmPlan(null);
          return;
        }
        window.location.href = data.checkout_url;
      }
    } catch {
      toast("플랜 변경에 실패했습니다.", "error");
      setChanging(false);
      setConfirmPlan(null);
    }
    setChanging(false);
  };

  if (loading) return <LoadingSpinner fullScreen label="구독 정보 불러오는 중..." />;

  const confirmPlanInfo = PLANS.find((p) => p.name === confirmPlan);
  const usePct = usage
    ? Math.min((usage.used / Math.max(usage.monthly_limit, 1)) * 100, 100)
    : 0;
  const warn = usePct >= 80;

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="결제 · 구독"
        title="구독 관리"
        subtitle="플랜 변경·결제 정보는 모두 Stripe 를 통해 안전하게 처리됩니다."
      />

      {/* 사용량 */}
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

      {/* 플랜 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PLANS.map((plan) => {
          const isCurrent = sub?.plan === plan.name;
          return (
            <Card
              key={plan.name}
              padding={24}
              radius={16}
              style={{
                borderColor: isCurrent ? "var(--gold-bright)" : "var(--line)",
                background: isCurrent ? "var(--gold-soft)" : "var(--bg-card)",
                boxShadow: isCurrent
                  ? "0 0 0 3px rgba(255, 182, 39, 0.18)"
                  : "var(--shadow-sm)",
              }}
            >
              <div style={{ marginBottom: 18 }}>
                <div className="flex items-center gap-2">
                  <h3
                    style={{
                      ...displayStyle,
                      margin: 0,
                      fontSize: 17,
                      fontWeight: 700,
                      color: "var(--text)",
                    }}
                  >
                    {plan.label}
                  </h3>
                  {isCurrent && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        background: "linear-gradient(135deg, #FFB627, #E89E0E)",
                        color: "#0A0A0A",
                        padding: "2px 8px",
                        borderRadius: 999,
                        letterSpacing: "0.06em",
                      }}
                    >
                      현재
                    </span>
                  )}
                </div>
                <p
                  style={{
                    ...tabularStyle,
                    margin: "8px 0 2px",
                    fontSize: 24,
                    fontWeight: 800,
                    color: "var(--gold)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {plan.price}
                </p>
                <p
                  style={{
                    ...tabularStyle,
                    margin: 0,
                    fontSize: 11.5,
                    color: "var(--text-subtle)",
                  }}
                >
                  월 {plan.limit}편 렌더링
                </p>
              </div>
              <ul
                style={{
                  margin: "0 0 18px",
                  padding: 0,
                  listStyle: "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                {plan.features.map((f) => (
                  <li
                    key={f}
                    style={{
                      fontSize: 12.5,
                      color: "var(--text-muted)",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--success)"
                      strokeWidth={2.6}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ flexShrink: 0 }}
                      aria-hidden="true"
                    >
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <span
                  className="block text-center"
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--gold)",
                    padding: "10px 0",
                  }}
                >
                  사용 중
                </span>
              ) : (
                <PrimaryButton
                  variant="primary"
                  size="md"
                  onClick={() => setConfirmPlan(plan.name)}
                  disabled={changing}
                  style={{ width: "100%", justifyContent: "center" }}
                >
                  {plan.name === "FREE" ? "다운그레이드" : "업그레이드"}
                </PrimaryButton>
              )}
            </Card>
          );
        })}
      </div>

      {/* 플랜 변경 확인 모달 */}
      <Modal open={!!confirmPlan} onClose={() => setConfirmPlan(null)} title="플랜 변경">
        {confirmPlanInfo && (
          <div className="space-y-4" style={{ paddingTop: 8 }}>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
              <span
                style={{
                  fontWeight: 600,
                  color: "var(--text)",
                }}
              >
                {confirmPlanInfo.label}
              </span>{" "}
              플랜({confirmPlanInfo.price})으로 변경하시겠습니까?
            </p>
            {confirmPlanInfo.name === "FREE" ? (
              <div
                style={{
                  background: "var(--gold-soft)",
                  border: "1px solid var(--gold-medium)",
                  borderRadius: 10,
                  padding: "12px 14px",
                }}
              >
                <p style={{ margin: 0, fontSize: 13, color: "var(--gold)" }}>
                  무료 플랜으로 변경하면 월 렌더링 한도가 2편으로 줄어듭니다.
                </p>
              </div>
            ) : (
              <div
                style={{
                  background: "rgba(59, 130, 246, 0.08)",
                  border: "1px solid rgba(59, 130, 246, 0.24)",
                  borderRadius: 10,
                  padding: "12px 14px",
                }}
              >
                <p style={{ margin: 0, fontSize: 13, color: "var(--info)" }}>
                  Stripe 결제 페이지로 이동합니다.
                </p>
              </div>
            )}
            <div
              className="flex gap-3 justify-end"
              style={{ paddingTop: 8 }}
            >
              <button
                type="button"
                onClick={() => setConfirmPlan(null)}
                style={{
                  padding: "8px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text)",
                  background: "var(--bg-card)",
                  border: "1px solid var(--line-strong)",
                  borderRadius: 10,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                취소
              </button>
              <PrimaryButton
                variant="primary"
                size="md"
                onClick={handleChangePlan}
                disabled={changing}
              >
                {changing
                  ? "처리 중..."
                  : confirmPlanInfo.name === "FREE"
                    ? "다운그레이드"
                    : "결제하기"}
              </PrimaryButton>
            </div>
          </div>
        )}
      </Modal>
    </PageContainer>
  );
}
