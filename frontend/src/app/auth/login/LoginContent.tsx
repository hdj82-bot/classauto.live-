"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_state: "인증 요청이 만료되었습니다. 다시 시도해주세요.",
  google_failed: "Google 인증에 실패했습니다. 잠시 후 다시 시도해주세요.",
};

export default function LoginContent() {
  const searchParams = useSearchParams();
  const errorKey = searchParams.get("error");
  const errorMsg = errorKey ? ERROR_MESSAGES[errorKey] : null;

  const [role, setRole] = useState<"professor" | "student">("student");
  const [isRedirecting, setIsRedirecting] = useState(false);

  const handleGoogleLogin = () => {
    setIsRedirecting(true);
    window.location.href = `${BACKEND_URL}/api/auth/google?role=${role}`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* 로고 / 헤더 */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600 text-white text-2xl font-bold mb-4 select-none">
            IFL
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            Interactive Flipped Learning
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            학교 Google 계정으로 로그인하세요
          </p>
        </div>

        {/* 에러 메시지 */}
        {errorMsg && (
          <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        {/* 카드 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 space-y-6">
          {/* 역할 선택 */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">
              계정 유형 선택
            </p>
            <div className="grid grid-cols-2 gap-3">
              <RoleButton
                label="학습자"
                description="수업을 듣는 학생"
                icon="🎓"
                selected={role === "student"}
                onClick={() => setRole("student")}
              />
              <RoleButton
                label="교수자"
                description="수업을 만드는 교수"
                icon="📚"
                selected={role === "professor"}
                onClick={() => setRole("professor")}
              />
            </div>
          </div>

          {/* 구분선 */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs text-gray-400">
              <span className="bg-white px-3">소셜 로그인</span>
            </div>
          </div>

          {/* Google 로그인 버튼 */}
          <button
            onClick={handleGoogleLogin}
            disabled={isRedirecting}
            className="w-full flex items-center justify-center gap-3 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isRedirecting ? <Spinner /> : <GoogleIcon />}
            <span>
              {isRedirecting
                ? "Google로 이동 중..."
                : `${role === "professor" ? "교수자" : "학습자"}로 Google 로그인`}
            </span>
          </button>

          <p className="text-center text-xs text-gray-400">
            로그인 시{" "}
            <a href="#" className="underline hover:text-gray-600">
              이용약관
            </a>{" "}
            및{" "}
            <a href="#" className="underline hover:text-gray-600">
              개인정보처리방침
            </a>
            에 동의합니다.
          </p>
        </div>
      </div>
    </div>
  );
}

function RoleButton({
  label,
  description,
  icon,
  selected,
  onClick,
}: {
  label: string;
  description: string;
  icon: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition
        ${
          selected
            ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500"
            : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
        }`}
    >
      <span className="text-xl">{icon}</span>
      <span
        className={`text-sm font-semibold ${selected ? "text-indigo-700" : "text-gray-800"}`}
      >
        {label}
      </span>
      <span className="text-xs text-gray-400">{description}</span>
    </button>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin w-4 h-4 text-gray-500"
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
  );
}
