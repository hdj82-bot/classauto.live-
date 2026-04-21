"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // Sentry가 로드된 경우 에러 캡처
    import("@sentry/nextjs")
      .then((Sentry) => Sentry.captureException(error))
      .catch(() => {});
  }, [error]);
  return (
    <html lang="ko">
      <body className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-red-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            문제가 발생했습니다
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            예상치 못한 오류가 발생했습니다. 아래 버튼을 눌러 다시 시도해주세요.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => unstable_retry()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl px-6 py-2.5 transition"
            >
              다시 시도
            </button>
            <button
              onClick={() => (window.location.href = "/")}
              className="border border-gray-300 hover:border-gray-400 text-gray-700 text-sm font-medium rounded-xl px-6 py-2.5 transition"
            >
              홈으로
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
