"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useI18n } from "@/contexts/I18nContext";

interface Stats {
  total_users: number;
  total_courses: number;
  total_lectures: number;
  total_sessions: number;
  total_renders: number;
}

export default function AdminDashboardPage() {
  const { t } = useI18n();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/api/v1/admin/stats");
        setStats(data);
      } catch {
        setError(t("admin.statsLoadError"));
      }
      setLoading(false);
    })();
  }, [t]);

  if (loading) return <LoadingSpinner fullScreen label={t("admin.statsLoadingLabel")} />;
  if (error) return <div className="text-red-600 text-center py-20" role="alert">{error}</div>;
  if (!stats) return null;

  const cards = [
    { label: t("admin.totalUsers"), value: stats.total_users, color: "bg-blue-500" },
    { label: t("admin.totalCourses"), value: stats.total_courses, color: "bg-green-500" },
    { label: t("admin.totalLectures"), value: stats.total_lectures, color: "bg-purple-500" },
    { label: t("admin.totalSessions"), value: stats.total_sessions, color: "bg-orange-500" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t("admin.dashboardTitle")}</h1>

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((card) => (
          <div key={card.label} className="bg-white rounded-xl shadow-sm p-6">
            <div className={`inline-block w-3 h-3 rounded-full ${card.color} mr-2`} />
            <span className="text-sm text-gray-500">{card.label}</span>
            <p className="text-3xl font-bold text-gray-900 mt-2">
              {card.value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      {/* 렌더링 통계 */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{t("admin.renderStatusTitle")}</h2>
        <p className="text-4xl font-bold text-indigo-600">{stats.total_renders.toLocaleString()}</p>
        <p className="text-sm text-gray-500 mt-1">{t("admin.renderStatusDesc")}</p>
      </div>
    </div>
  );
}
