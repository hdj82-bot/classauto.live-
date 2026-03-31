"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

interface Lecture { id: string; title: string; slug: string; is_published: boolean; }

export default function ProfessorDashboardPage() {
  const router = useRouter();
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data: courses } = await api.get("/api/courses");
        const allLectures: Lecture[] = [];
        for (const c of courses) {
          const { data: lecs } = await api.get(`/api/courses/${c.id}/lectures`);
          allLectures.push(...lecs);
        }
        setLectures(allLectures);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  if (loading) return <LoadingSpinner fullScreen label="강의 목록 불러오는 중..." />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">강의 관리</h1>
        <button onClick={() => router.push("/professor/lecture/new")}
          className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-5 py-2.5 text-sm font-medium transition">
          새 강의 만들기
        </button>
      </div>

      {lectures.length === 0 ? (
        <div className="text-center py-20 text-gray-400">아직 강의가 없습니다</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {lectures.map((lec) => (
            <div key={lec.id} className="bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-sm transition">
              <h3 className="font-semibold text-gray-900 mb-2 truncate">{lec.title}</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full ${lec.is_published ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                {lec.is_published ? "공개" : "비공개"}
              </span>
              <div className="mt-4 flex gap-2">
                <button onClick={() => router.push(`/professor/lecture/${lec.id}`)}
                  className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg px-3 py-1.5 transition">스크립트 편집</button>
                <button onClick={() => router.push(`/professor/lecture/${lec.id}/dashboard`)}
                  className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg px-3 py-1.5 transition">분석</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
