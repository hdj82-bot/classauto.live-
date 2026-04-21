"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/contexts/I18nContext";
import Header from "@/components/Header";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

interface Course { id: string; title: string; description: string | null; is_published: boolean; }
interface Lecture { id: string; title: string; slug: string; is_published: boolean; video_url: string | null; thumbnail_url: string | null; }

export default function DashboardPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const { t } = useI18n();
  const [courses, setCourses] = useState<Course[]>([]);
  const [lectures, setLectures] = useState<Record<string, Lecture[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user) router.replace("/auth/login");
  }, [user, isLoading, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setError(null);
      try {
        const { data } = await api.get("/api/courses");
        setCourses(data);
        const lectureMap: Record<string, Lecture[]> = {};
        for (const course of data) {
          const { data: lecs } = await api.get(`/api/courses/${course.id}/lectures`);
          lectureMap[course.id] = lecs;
        }
        setLectures(lectureMap);
      } catch {
        setError(t("dashboard.loadError"));
      }
      setLoading(false);
    })();
  }, [user]);

  if (isLoading || !user) return <LoadingSpinner fullScreen label={t("common.loading")} />;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          {user.role === "professor" ? t("dashboard.myCoursesProf") : t("dashboard.myCoursesStudent")}
        </h1>

        {loading ? (
          <LoadingSpinner label={t("dashboard.loadingCourses")} />
        ) : error ? (
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
        ) : courses.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-100 flex items-center justify-center" aria-hidden="true">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
            </div>
            <p className="text-lg font-medium text-gray-700 mb-1">{t("dashboard.noCourses")}</p>
            <p className="text-sm text-gray-400 mb-6">
              {user.role === "professor" ? t("dashboard.noCoursesDescProf") : t("dashboard.noCoursesDescStudent")}
            </p>
            {user.role === "professor" && (
              <button onClick={() => router.push("/professor/lecture/new")}
                className="bg-indigo-600 text-white rounded-xl px-6 py-2.5 text-sm font-medium hover:bg-indigo-700 transition">
                {t("dashboard.createLecture")}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {courses.map((course) => (
              <section key={course.id} className="bg-white rounded-2xl border border-gray-200 p-6" aria-labelledby={`course-${course.id}`}>
                <h2 id={`course-${course.id}`} className="text-lg font-semibold text-gray-900 mb-1">{course.title}</h2>
                {course.description && <p className="text-sm text-gray-500 mb-4">{course.description}</p>}
                {(lectures[course.id] || []).length === 0 ? (
                  <p className="text-sm text-gray-400 py-4">{t("dashboard.noLectures")}</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {(lectures[course.id] || []).map((lec) => (
                      <article key={lec.id}
                        onClick={() => user.role === "student" ? router.push(`/lecture/${lec.slug}`) : router.push(`/professor/lecture/${lec.id}`)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); user.role === "student" ? router.push(`/lecture/${lec.slug}`) : router.push(`/professor/lecture/${lec.id}`); } }}
                        aria-label={`${lec.title} - ${lec.is_published ? t("common.published") : t("common.unpublished")}`}
                        className="border border-gray-200 rounded-xl p-4 hover:border-indigo-300 hover:shadow-sm transition cursor-pointer group">
                        <div className="aspect-video bg-gray-100 rounded-lg mb-3 flex items-center justify-center overflow-hidden">
                          {lec.thumbnail_url ? (
                            <img src={lec.thumbnail_url} alt={`${lec.title} thumbnail`} className="w-full h-full object-cover rounded-lg" />
                          ) : (
                            <svg className="w-10 h-10 text-gray-300 group-hover:text-indigo-400 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
                            </svg>
                          )}
                        </div>
                        <h3 className="text-sm font-medium text-gray-900 truncate">{lec.title}</h3>
                        <span className={`mt-1 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${lec.is_published ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${lec.is_published ? "bg-green-500" : "bg-gray-400"}`} aria-hidden="true" />
                          {lec.is_published ? t("common.published") : t("common.unpublished")}
                        </span>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
