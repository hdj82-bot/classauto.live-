import { installHydrationErrorReporter } from "@/lib/hydrationErrorReporter";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  import("@sentry/nextjs").then((Sentry) => {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 1.0,
      sendDefaultPii: false,
    });
  });

  // React #418 실측 계측 (이슈 #167). instrumentation-client 는 hydration 직전에
  // 동기 실행되므로, 여기서 console.error 훅을 설치하면 첫 hydration pass 의
  // recoverable mismatch 부터 빠짐없이 Sentry 로 보고된다. Sentry init 은 위에서
  // 비동기로 로드되지만, 리포터는 캡처 시점에 @sentry/nextjs 를 동적 import
  // 하므로 init 완료를 기다릴 필요가 없다(같은 모듈 인스턴스 재사용).
  installHydrationErrorReporter();
}
