"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import Modal from "@/components/ui/Modal";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

interface SubscriptionData { user_id: string; plan: string; monthly_limit: number; }
interface UsageData { plan: string; monthly_limit: number; used: number; remaining: number; period: string; }

const PLANS = [
  { name: "FREE", label: "무료", limit: 2, price: "무료", features: ["월 2편 렌더링", "기본 Q&A", "기본 대시보드"] },
  { name: "BASIC", label: "베이직", limit: 10, price: "₩29,000/월", features: ["월 10편 렌더링", "고급 Q&A", "상세 대시보드", "번역 지원"] },
  { name: "PRO", label: "프로", limit: 20, price: "₩59,000/월", features: ["월 20편 렌더링", "무제한 Q&A", "전체 분석", "우선 렌더링", "번역 지원"] },
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
        // FREE 다운그레이드: 직접 처리
        await api.post(`/api/v1/subscription?plan=FREE`);
        await fetchData();
        toast("무료 플랜으로 변경되었습니다.", "success");
        setConfirmPlan(null);
      } else {
        // BASIC/PRO 업그레이드: Stripe Checkout으로 이동
        const { data } = await api.post(`/api/v1/payment/checkout?plan=${confirmPlan}`);
        window.location.href = data.checkout_url;
        // 리다이렉트 후에는 아래 코드가 실행되지 않음
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

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">구독 관리</h1>

      {/* 사용량 */}
      {usage && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-8">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-700">이번 달 사용량 ({usage.period})</span>
            <span className="text-sm text-gray-500">{usage.used} / {usage.monthly_limit}편</span>
          </div>
          <div className="bg-gray-100 rounded-full h-3">
            <div className={`h-3 rounded-full transition-all ${
              usage.used / usage.monthly_limit > 0.8 ? "bg-amber-500" : "bg-indigo-500"
            }`} style={{ width: `${Math.min((usage.used / usage.monthly_limit) * 100, 100)}%` }} />
          </div>
          <p className="text-xs text-gray-400 mt-2">남은 횟수: {usage.remaining}편</p>
        </div>
      )}

      {/* 플랜 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PLANS.map((plan) => {
          const isCurrent = sub?.plan === plan.name;
          return (
            <div key={plan.name}
              className={`border rounded-2xl p-6 transition ${isCurrent ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500" : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"}`}>
              <div className="mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-gray-900">{plan.label}</h3>
                  {isCurrent && <span className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded-full">현재</span>}
                </div>
                <p className="text-2xl font-bold text-indigo-600 mt-1">{plan.price}</p>
                <p className="text-xs text-gray-400">월 {plan.limit}편 렌더링</p>
              </div>
              <ul className="space-y-2 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="text-sm text-gray-600 flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <span className="block text-center text-sm font-medium text-indigo-600 py-2.5">사용 중</span>
              ) : (
                <button onClick={() => setConfirmPlan(plan.name)} disabled={changing}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-medium transition">
                  {plan.name === "FREE" ? "다운그레이드" : "업그레이드"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* 플랜 변경 확인 모달 */}
      <Modal open={!!confirmPlan} onClose={() => setConfirmPlan(null)} title="플랜 변경">
        {confirmPlanInfo && (
          <div className="space-y-4 pt-2">
            <p className="text-sm text-gray-600">
              <span className="font-medium text-gray-900">{confirmPlanInfo.label}</span> 플랜({confirmPlanInfo.price})으로 변경하시겠습니까?
            </p>
            {confirmPlanInfo.name === "FREE" ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <p className="text-sm text-amber-700">
                  무료 플랜으로 변경하면 월 렌더링 한도가 2편으로 줄어듭니다.
                </p>
              </div>
            ) : (
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
                <p className="text-sm text-indigo-700">
                  Stripe 결제 페이지로 이동합니다.
                </p>
              </div>
            )}
            <div className="flex gap-3 justify-end pt-2">
              <button onClick={() => setConfirmPlan(null)}
                className="text-sm border border-gray-300 rounded-xl px-4 py-2 hover:bg-gray-50 transition">
                취소
              </button>
              <button onClick={handleChangePlan} disabled={changing}
                className="text-sm bg-indigo-600 text-white rounded-xl px-4 py-2 hover:bg-indigo-700 disabled:opacity-50 transition">
                {changing ? "처리 중..." : confirmPlanInfo.name === "FREE" ? "다운그레이드" : "결제하기"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
