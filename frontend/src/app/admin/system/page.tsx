"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

interface SystemData {
  db_size_mb: number | null;
  redis_used_memory_mb: number | null;
  redis_connected_clients: number | null;
  celery_queue_length: number | null;
}

export default function AdminSystemPage() {
  const [data, setData] = useState<SystemData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const { data: res } = await api.get("/api/v1/admin/system");
      setData(res);
      setError(null);
    } catch {
      setError("시스템 상태를 불러올 수 없습니다.");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <LoadingSpinner fullScreen label="시스템 상태 로딩 중..." />;
  if (error) return <div className="text-red-600 text-center py-20">{error}</div>;
  if (!data) return null;

  const items = [
    {
      title: "PostgreSQL",
      metrics: [
        { label: "데이터베이스 크기", value: data.db_size_mb != null ? `${data.db_size_mb} MB` : "N/A" },
      ],
      status: data.db_size_mb != null ? "online" : "unknown",
    },
    {
      title: "Redis",
      metrics: [
        { label: "사용 메모리", value: data.redis_used_memory_mb != null ? `${data.redis_used_memory_mb} MB` : "N/A" },
        { label: "연결된 클라이언트", value: data.redis_connected_clients != null ? `${data.redis_connected_clients}` : "N/A" },
      ],
      status: data.redis_used_memory_mb != null ? "online" : "unknown",
    },
    {
      title: "Celery",
      metrics: [
        { label: "대기열 길이", value: data.celery_queue_length != null ? `${data.celery_queue_length}` : "N/A" },
      ],
      status: data.celery_queue_length != null ? "online" : "unknown",
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">시스템 ���니터링</h1>
        <button
          onClick={fetchData}
          className="text-sm text-indigo-600 hover:underline"
        >
          새로고침
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

      <p className="text-xs text-gray-400 mt-6 text-center">30초마다 자동 갱신됩니다.</p>
    </div>
  );
}
