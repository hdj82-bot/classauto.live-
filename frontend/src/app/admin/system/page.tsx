"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useI18n } from "@/contexts/I18nContext";

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
  if (error) return <div className="text-red-600 text-center py-20" role="alert">{error}</div>;
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("admin.systemTitle")}</h1>
        <button
          onClick={fetchData}
          className="text-sm text-indigo-600 hover:underline"
        >
          {t("admin.systemRefresh")}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {items.map((item) => (
          <div key={item.title} className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <span
                className={`inline-block w-2.5 h-2.5 rounded-full ${
                  item.status === "online" ? "bg-green-500" : "bg-gray-400"
                }`}
              />
              <h3 className="text-lg font-semibold text-gray-900">{item.title}</h3>
            </div>
            <div className="space-y-2">
              {item.metrics.map((m) => (
                <div key={m.label} className="flex justify-between text-sm">
                  <span className="text-gray-500">{m.label}</span>
                  <span className="font-mono text-gray-900">{m.value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 mt-6 text-center">{t("admin.systemAutoRefresh")}</p>
    </div>
  );
}
