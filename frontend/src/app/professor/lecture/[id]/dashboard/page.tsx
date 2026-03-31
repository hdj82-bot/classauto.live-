"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

type Tab = "attendance" | "scores" | "engagement" | "cost";

export default function LectureDashboardPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>("attendance");
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    (async () => {
      try {
        const { data: result } = await api.get(`/api/v1/dashboard/${id}/${tab}`);
        setData(result);
      } catch { setData(null); }
      setLoading(false);
    })();
  }, [id, tab]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "attendance", label: "출석" },
    { key: "scores", label: "정답률" },
    { key: "engagement", label: "참여도" },
    { key: "cost", label: "비용" },
  ];

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-6">강의 분석</h1>

      {/* 탭 */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              tab === t.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? <LoadingSpinner label="데이터 불러오는 중..." /> : !data ? (
        <p className="text-gray-400 text-center py-10">데이터가 없습니다</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          {tab === "attendance" && <AttendanceView data={data} />}
          {tab === "scores" && <ScoresView data={data} />}
          {tab === "engagement" && <EngagementView data={data} />}
          {tab === "cost" && <CostView data={data} />}
        </div>
      )}
    </div>
  );
}

function AttendanceView({ data }: { data: Record<string, unknown> }) {
  const summary = (data.summary || {}) as Record<string, number>;
  const students = (data.students || []) as Record<string, unknown>[];
  return (
    <div>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="전체" value={summary.total ?? 0} />
        <StatCard label="실시간" value={summary.live ?? 0} color="text-green-600" />
        <StatCard label="사후 시청" value={summary.vod ?? 0} color="text-blue-600" />
      </div>
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left text-gray-500"><th className="pb-2">이름</th><th>학번</th><th>유형</th><th>진행률</th></tr></thead>
        <tbody>
          {students.map((s, i) => (
            <tr key={i} className="border-b border-gray-100">
              <td className="py-2 text-gray-900">{s.name as string}</td>
              <td className="text-gray-500">{(s.studentNumber as string) || "-"}</td>
              <td><span className={`text-xs px-2 py-0.5 rounded-full ${s.type === "live" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>{s.type as string}</span></td>
              <td className="text-gray-500">{(s.progress_pct as number)?.toFixed(0)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScoresView({ data }: { data: Record<string, unknown> }) {
  const byType = (data.byType || []) as { type: string; accuracy: number; total: number }[];
  return (
    <div>
      <div className="text-3xl font-bold text-indigo-700 mb-4">{(data.overallAccuracy as number)?.toFixed(1)}%</div>
      <p className="text-sm text-gray-500 mb-6">전체 정답률 ({data.totalQuestions as number}문항)</p>
      <div className="space-y-3">
        {byType.map((t) => (
          <div key={t.type} className="flex items-center gap-3">
            <span className="text-sm text-gray-700 w-24">{t.type}</span>
            <div className="flex-1 bg-gray-100 rounded-full h-2"><div className="bg-indigo-500 h-2 rounded-full" style={{ width: `${t.accuracy}%` }} /></div>
            <span className="text-sm text-gray-500 w-16 text-right">{t.accuracy}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EngagementView({ data }: { data: Record<string, unknown> }) {
  const summary = (data.summary || {}) as Record<string, number>;
  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="총 학생 수" value={summary.totalStudents ?? 0} />
        <StatCard label="Q&A 질문 수" value={summary.totalQAQuestions ?? 0} />
        <StatCard label="응답률" value={`${summary.overallResponseRate ?? 0}%`} color="text-green-600" />
        <StatCard label="무반응 이벤트" value={summary.totalNoResponseEvents ?? 0} color="text-red-600" />
      </div>
    </div>
  );
}

function CostView({ data }: { data: Record<string, unknown> }) {
  const summary = (data.summary || {}) as Record<string, number>;
  const byCategory = (data.byCategory || []) as { category: string; costUsd: number; count: number }[];
  return (
    <div>
      <div className="text-3xl font-bold text-gray-900 mb-1">${(summary.totalCostUsd ?? 0).toFixed(4)}</div>
      <p className="text-sm text-gray-500 mb-6">총 비용 ({summary.totalRequests ?? 0}건)</p>
      <div className="space-y-2">
        {byCategory.map((c) => (
          <div key={c.category} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
            <span className="text-sm font-medium text-gray-700">{c.category}</span>
            <div className="text-right">
              <span className="text-sm text-gray-900">${c.costUsd.toFixed(4)}</span>
              <span className="text-xs text-gray-400 ml-2">({c.count}건)</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color || "text-gray-900"}`}>{value}</p>
    </div>
  );
}
