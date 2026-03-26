import { Suspense } from "react";
import CallbackContent from "./CallbackContent";

export default function CallbackPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <CallbackContent />
    </Suspense>
  );
}

function LoadingSpinner() {
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
