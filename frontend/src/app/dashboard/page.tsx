"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function DashboardPage() {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) router.replace("/auth/login");
  }, [user, isLoading, router]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-gray-400">로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>
      <p className="text-gray-500">
        역할:{" "}
        <span className="font-medium text-indigo-600">
          {user.role === "professor" ? "교수자" : "학습자"}
        </span>
      </p>
      <button
        onClick={logout}
        className="mt-4 rounded-xl border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        로그아웃
      </button>
    </div>
  );
}
