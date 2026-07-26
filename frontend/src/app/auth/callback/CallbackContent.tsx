"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { authApi } from "@/lib/api";
import { takeAuthNext } from "@/lib/authNext";

function parseJwtPayload(token: string): Record<string, unknown> | null {
  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch {
    return null;
  }
}

function redirectByRole(role: string | undefined, router: ReturnType<typeof useRouter>) {
  if (role === "admin") {
    router.replace("/admin");
  } else if (role === "professor") {
    router.replace("/professor/dashboard");
  } else {
    // 학생은 보관해 둔 딥링크로 돌려보낸다(예: 스캔한 /c/[slug]). 이걸 빼면
    // **이미 계정이 있는 학생**이 강좌 QR 을 찍어도 대시보드로 떨어져 등록이
    // 호출되지 않는다 — 신규 가입만 complete-profile 에서 복귀하기 때문이다.
    router.replace(takeAuthNext() ?? "/dashboard");
  }
}

export default function CallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { login } = useAuth();
  // code는 1회용이므로 StrictMode 이중 실행으로 두 번 교환되어 두 번째가 401나는 것을 막는다.
  const exchangedRef = useRef(false);

  useEffect(() => {
    if (exchangedRef.current) return;
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!code) {
      router.replace("/auth/login?error=invalid_state");
      return;
    }

    exchangedRef.current = true;
    (async () => {
      try {
        const { data } = await authApi.exchange(code, state ?? undefined);
        login(data.access_token);
        const payload = parseJwtPayload(data.access_token);
        redirectByRole(payload?.role as string | undefined, router);
      } catch {
        router.replace("/auth/login?error=exchange_failed");
      }
    })();
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
