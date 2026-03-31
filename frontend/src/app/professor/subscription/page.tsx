"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

interface SubscriptionData { user_id: string; plan: string; monthly_limit: number; }
interface UsageData { plan: string; monthly_limit: number; used: number; remaining: number; period: string; }

const PLANS = [
  { name: "FREE", label: "무료", limit: 2, price: "무료", features: ["월 2편 렌더링", "기본 Q&A", "기본 대시보드"] },
  { name: "BASIC", label: "베이직", limit: 10, price: "₩29,000/월", features: ["월 10편 렌더링", "고급 Q&A", "상세 대시보드", "번역 지원"] },
  { name: "PRO", label: "프로", limit: 20, price: "₩59,000/월", features: ["월 20편 렌더링", "무제한 Q&A", "전체 분석", "우선 렌더링", "번역 지원"] },
];

export default function SubscriptionPage() {
  const [sub, setSub] = useState<SubscriptionData | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [changing, setChanging] = useState(false);

  const fetchData = async () => {
    try {
      const [{ data: s }, { data: u }] = await Promise.all([
        api.get("/api/v1/subscription"),
        api.get("/api/v1/subscription/usage"),
      ]);
      setSub(s);
      setUsage(u);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleChangePlan = async (plan: string) => {
    setChanging(true);
    try {
      await api.post(`/api/v1/subscription?plan=${plan}`);
      await fetchData();
    } catch { /* ignore */ }
    setChanging(false);
  };

  if (loading) return <LoadingSpinner fullScreen label="구독 정보 불러오는 중..." />;

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
            <div className="bg-indigo-500 h-3 rounded-full transition-all"
              style={{ width: `${Math.min((usage.used / usage.monthly_limit) * 100, 100)}%` }} />
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
              className={`border rounded-2xl p-6 transition ${isCurrent ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500" : "border-gray-200 bg-white"}`}>
              <div className="mb-4">
                <h3 className="text-lg font-bold text-gray-900">{plan.label}</h3>
                <p className="text-2xl font-bold text-indigo-600 mt-1">{plan.price}</p>
                <p className="text-xs text-gray-400">월 {plan.limit}편 렌더링</p>
              </div>
              <ul className="space-y-2 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="text-sm text-gray-600 flex items-center gap-2">
                    <span className="text-green-500 text-xs">&#10003;</span> {f}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <span className="block text-center text-sm font-medium text-indigo-600">현재 플랜</span>
              ) : (
                <button onClick={() => handleChangePlan(plan.name)} disabled={changing}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-medium transition">
                  {changing ? "변경 중..." : "변경하기"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
