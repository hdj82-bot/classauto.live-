"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useI18n } from "@/contexts/I18nContext";

// 스펙 14 §E — v2 토큰 전환. 온라인/불명 dot 은 §0-6 이 허용하는 상태 인디케이터.
interface SystemData {
  db_size_mb: number | null;
  redis_used_memory_mb: number | null;
  redis_connected_clients: number | null;
  celery_queue_length: number | null;
}

export default function AdminSystemPage() {
  const { t } = useI18n();
  const [data, setData] = useState<SystemData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const fetchData = useCallback(async () => {
    try {
      const { data: res } = await api.get<SystemData>("/api/v1/admin/system");
      if (cancelledRef.current) return;
      setData(res);
      setError(null);
    } catch {
      if (cancelledRef.current) return;
      setError(t("admin.systemLoadError"));
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    cancelledRef.current = false;
    void Promise.resolve().then(() => {
      if (!cancelledRef.current) void fetchData();
    });
    const interval = setInterval(fetchData, 30000);
    return () => {
      cancelledRef.current = true;
      clearInterval(interval);
    };
  }, [fetchData]);

  if (loading) return <LoadingSpinner fullScreen label={t("admin.systemLoadingLabel")} />;
  if (error) {
    return (
      <div className="py-20 text-center text-warning" role="alert">
        {error}
      </div>
    );
  }
  if (!data) return null;

  const items = [
    {
      title: t("admin.systemPostgres"),
      metrics: [
        { label: t("admin.systemDbSize"), value: data.db_size_mb != null ? `${data.db_size_mb} MB` : "N/A" },
      ],
      status: data.db_size_mb != null ? "online" : "unknown",
    },
    {
      title: t("admin.systemRedis"),
      metrics: [
        { label: t("admin.systemRedisMemory"), value: data.redis_used_memory_mb != null ? `${data.redis_used_memory_mb} MB` : "N/A" },
        { label: t("admin.systemRedisClients"), value: data.redis_connected_clients != null ? `${data.redis_connected_clients}` : "N/A" },
      ],
      status: data.redis_used_memory_mb != null ? "online" : "unknown",
    },
    {
      title: t("admin.systemCelery"),
      metrics: [
        { label: t("admin.systemQueueLen"), value: data.celery_queue_length != null ? `${data.celery_queue_length}` : "N/A" },
      ],
      status: data.celery_queue_length != null ? "online" : "unknown",
    },
  ];

  return (
    <div>
      <div className="animate-fade-in-up mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-text">
          {t("admin.systemTitle")}
        </h1>
        <button
          type="button"
          onClick={fetchData}
          className="rounded-lg border border-line-strong px-3 py-1.5 text-sm font-semibold text-text-muted transition hover:bg-bg-hover"
        >
          {t("admin.systemRefresh")}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {items.map((item, i) => (
          <div
            key={item.title}
            className={`animate-fade-in-up stagger-${i + 1} rounded-2xl border border-line bg-bg-card p-5 shadow-sm`}
          >
            <div className="mb-4 flex items-center gap-2">
              <span
                aria-hidden
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  item.status === "online" ? "bg-success" : "bg-text-faint"
                }`}
              />
              <h3 className="text-base font-bold text-text">{item.title}</h3>
            </div>
            <div className="space-y-2">
              {item.metrics.map((m) => (
                <div key={m.label} className="flex justify-between text-sm">
                  <span className="text-text-muted">{m.label}</span>
                  <span className="tabular-nums text-text">{m.value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-6 text-center text-xs text-text-subtle">{t("admin.systemAutoRefresh")}</p>
    </div>
  );
}
