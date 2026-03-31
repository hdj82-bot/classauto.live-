"use client";

import { useRouter } from "next/navigation";

export default function ExpiredPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center max-w-md">
        <div className="text-5xl mb-4">⏰</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">시청 기간이 만료되었습니다</h1>
        <p className="text-sm text-gray-500 mb-6">이 강의의 열람 가능 기간이 지났습니다. 교수자에게 문의해 주세요.</p>
        <button
          onClick={() => router.push("/dashboard")}
          className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-6 py-2.5 text-sm font-medium transition"
        >
          대시보드로 돌아가기
        </button>
      </div>
    </div>
  );
}
