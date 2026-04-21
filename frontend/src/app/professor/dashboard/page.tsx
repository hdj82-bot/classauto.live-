"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useI18n } from "@/contexts/I18nContext";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

interface Lecture { id: string; title: string; slug: string; is_published: boolean; }

export default function ProfessorDashboardPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setError(null);
      try {
        const { data: courses } = await api.get("/api/courses");
        const allLectures: Lecture[] = [];
        for (const c of courses) {
          const { data: lecs } = await api.get(`/api/courses/${c.id}/lectures`);
          allLectures.push(...lecs);
        }
        setLectures(allLectures);
      } catch {
        setError(t("professor.loadError"));
      }
      setLoading(false);
    })();
  }, []);

  if (loading) return <LoadingSpinner fullScreen label={t("lecture.lectureLoadingList")} />;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("professor.lectureManage")}</h1>
        <button onClick={() => router.push("/professor/lecture/new")}
          className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-5 py-2.5 text-sm font-medium transition w-full sm:w-auto">
          {t("professor.createLecture")}
        </button>
      </div>

      {error ? (
        <div className="text-center py-20" role="alert">
          <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-red-100 flex items-center justify-center" aria-hidden="true">
            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <p className="text-gray-500 mb-4">{error}</p>
          <button onClick={() => window.location.reload()} className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl px-5 py-2.5 transition">
            {t("common.retry")}
          </button>
        </div>
      ) : lectures.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-100 flex items-center justify-center" aria-hidden="true">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-lg font-medium text-gray-700 mb-1">{t("professor.noLectures")}</p>
          <p className="text-sm text-gray-400 mb-6">{t("professor.noLecturesDesc")}</p>
          <button onClick={() => router.push("/professor/lecture/new")}
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-6 py-2.5 text-sm font-medium transition">
            {t("professor.createFirst")}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {lectures.map((lec) => (
            <article key={lec.id} className="bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-md hover:border-gray-300 transition group">
              <h3 className="font-semibold text-gray-900 mb-2 truncate">{lec.title}</h3>
              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${lec.is_published ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${lec.is_published ? "bg-green-500" : "bg-gray-400"}`} aria-hidden="true" />
                {lec.is_published ? t("common.published") : t("common.unpublished")}
              </span>
              <div className="mt-4 flex gap-2">
                <button onClick={() => router.push(`/professor/lecture/${lec.id}`)}
                  className="flex-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg px-3 py-2 transition font-medium">
                  {t("professor.editScript")}
                </button>
                <button onClick={() => router.push(`/professor/lecture/${lec.id}/dashboard`)}
                  className="flex-1 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg px-3 py-2 transition font-medium">
                  {t("professor.analytics")}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
