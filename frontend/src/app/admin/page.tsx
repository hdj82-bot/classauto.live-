"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useI18n } from "@/contexts/I18nContext";

/**
 * /admin — 콘솔 개요. 스펙 14 §E 로 v2 토큰 전환.
 *
 * 종전 4개 스탯 카드는 항목마다 다른 색 dot(파랑·초록·보라·주황)을 달고 있었다.
 * 이는 §0-6(색은 크기만 인코딩, 카테고리컬 팔레트 폐기) 위반이라 제거하고,
 * 구분은 라벨·배치가 맡는다.
 */

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
  if (error) {
    return (
      <div className="py-20 text-center text-warning" role="alert">
        {error}
      </div>
    );
  }
  if (!stats) return null;

  // 부분 200 응답(필드 누락)에서도 .toLocaleString() 크래시가 나지 않게 기본값 0.
  const cards = [
    { label: t("admin.totalUsers"), value: stats.total_users ?? 0 },
    { label: t("admin.totalCourses"), value: stats.total_courses ?? 0 },
    { label: t("admin.totalLectures"), value: stats.total_lectures ?? 0 },
    { label: t("admin.totalSessions"), value: stats.total_sessions ?? 0 },
  ];

  return (
    <div>
      <h1 className="animate-fade-in-up font-display text-2xl font-extrabold tracking-tight text-text">
        {t("admin.dashboardTitle")}
      </h1>

      {/* 통계 타일 */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card, i) => (
          <div
            key={card.label}
            className={`animate-fade-in-up stagger-${i + 1} rounded-2xl border border-line bg-bg-card p-5 shadow-sm`}
          >
            <p className="text-xs text-text-muted">{card.label}</p>
            <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums text-text">
              {card.value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      {/* 렌더링 통계 */}
      <div className="animate-fade-in-up stagger-5 mt-6 rounded-2xl border border-line bg-bg-card p-5 shadow-sm">
        <h2 className="text-base font-bold text-text">{t("admin.renderStatusTitle")}</h2>
        <p className="mt-1 text-4xl font-bold tracking-tight tabular-nums text-gold-on-light">
          {(stats.total_renders ?? 0).toLocaleString()}
        </p>
        <p className="mt-1 text-sm text-text-muted">{t("admin.renderStatusDesc")}</p>
      </div>
    </div>
  );
}
