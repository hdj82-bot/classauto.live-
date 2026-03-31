"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import Header from "@/components/Header";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

interface Course { id: string; title: string; description: string | null; is_published: boolean; }
interface Lecture { id: string; title: string; slug: string; is_published: boolean; video_url: string | null; thumbnail_url: string | null; }

export default function DashboardPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [lectures, setLectures] = useState<Record<string, Lecture[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoading && !user) router.replace("/auth/login");
  }, [user, isLoading, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data } = await api.get("/api/courses");
        setCourses(data);
        const lectureMap: Record<string, Lecture[]> = {};
        for (const course of data) {
          const { data: lecs } = await api.get(`/api/courses/${course.id}/lectures`);
          lectureMap[course.id] = lecs;
        }
        setLectures(lectureMap);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, [user]);

  if (isLoading || !user) return <LoadingSpinner fullScreen label="로딩 중..." />;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          {user.role === "professor" ? "내 강좌" : "수강 가능한 강의"}
        </h1>
        {loading ? <LoadingSpinner label="강좌 불러오는 중..." /> : courses.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-lg mb-2">아직 강좌가 없습니다</p>
            {user.role === "professor" && (
              <button onClick={() => router.push("/professor/lecture/new")}
                className="mt-4 bg-indigo-600 text-white rounded-xl px-6 py-2.5 text-sm font-medium hover:bg-indigo-700">새 강의 만들기</button>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {courses.map((course) => (
              <div key={course.id} className="bg-white rounded-2xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-1">{course.title}</h2>
                {course.description && <p className="text-sm text-gray-500 mb-4">{course.description}</p>}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {(lectures[course.id] || []).map((lec) => (
                    <div key={lec.id}
                      onClick={() => user.role === "student" ? router.push(`/lecture/${lec.slug}`) : router.push(`/professor/lecture/${lec.id}`)}
                      className="border border-gray-200 rounded-xl p-4 hover:border-indigo-300 hover:shadow-sm transition cursor-pointer">
                      <div className="aspect-video bg-gray-100 rounded-lg mb-3 flex items-center justify-center text-gray-300 text-3xl">
                        {lec.thumbnail_url ? <img src={lec.thumbnail_url} alt="" className="w-full h-full object-cover rounded-lg" /> : "▶"}
                      </div>
                      <h3 className="text-sm font-medium text-gray-900 truncate">{lec.title}</h3>
                      <span className={`mt-1 inline-block text-xs px-2 py-0.5 rounded-full ${lec.is_published ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {lec.is_published ? "공개" : "비공개"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
