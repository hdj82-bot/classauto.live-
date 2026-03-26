"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";

export default function CallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { login } = useAuth();

  useEffect(() => {
    const access = searchParams.get("access_token");
    const refresh = searchParams.get("refresh_token");

    if (!access || !refresh) {
      router.replace("/auth/login?error=invalid_state");
      return;
    }

    login(access, refresh);
    // URL에서 토큰 제거 (보안)
    window.history.replaceState(null, "", "/auth/callback");
    router.replace("/dashboard");
  }, [searchParams, login, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-3">
        <svg
          className="animate-spin mx-auto h-8 w-8 text-indigo-600"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
        <p className="text-sm text-gray-500">로그인 처리 중...</p>
      </div>
    </div>
  );
}
