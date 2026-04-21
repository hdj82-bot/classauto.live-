"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

interface CostData {
  total_cost_usd: number;
  by_service: { service: string; cost_usd: number }[];
  by_month: { year: number; month: number; cost_usd: number }[];
}

export default function AdminCostsPage() {
  const [data, setData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: res } = await api.get("/api/v1/admin/costs");
        setData(res);
      } catch {
        setError("비용 데이터를 불러올 수 없습니다.");
      }
      setLoading(false);
    })();
  }, []);

  if (loading) return <LoadingSpinner fullScreen label="비용 분석 로딩 중..." />;
  if (error) return <div className="text-red-600 text-center py-20">{error}</div>;
  if (!data) return null;

  const maxServiceCost = Math.max(...data.by_service.map((s) => s.cost_usd), 0.01);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">비용 분석</h1>

      {/* 총 비용 */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <p className="text-sm text-gray-500">총 API 비용</p>
        <p className="text-4xl font-bold text-gray-900 mt-1">
          ${data.total_cost_usd.toFixed(2)}
        </p>
      </div>

      {/* 서비스별 막대 차트 */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">서비스별 비용</h2>
        {data.by_service.length === 0 ? (
          <p className="text-gray-500 text-sm">데이터 없음</p>
        ) : (
          <div className="space-y-3">
            {data.by_service.map((item) => (
              <div key={item.service} className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-700 w-24 truncate">
                  {item.service}
                </span>
                <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                  <div
                    className="bg-indigo-500 h-full rounded-full transition-all"
                    style={{ width: `${(item.cost_usd / maxServiceCost) * 100}%` }}
                  />
                </div>
                <span className="text-sm text-gray-600 w-20 text-right">
                  ${item.cost_usd.toFixed(4)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 월별 비용 테이블 */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">월별 비용</h2>
        {data.by_month.length === 0 ? (
          <p className="text-gray-500 text-sm">데이터 없음</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-gray-600">기간</th>
                <th className="px-4 py-2 text-right font-medium text-gray-600">비용 (USD)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.by_month.map((item) => (
                <tr key={`${item.year}-${item.month}`}>
                  <td className="px-4 py-2">{item.year}년 {item.month}월</td>
                  <td className="px-4 py-2 text-right font-mono">${item.cost_usd.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
