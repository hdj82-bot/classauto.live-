/**
 * React #418 (recoverable hydration mismatch) 실측 계측 — 추적 이슈 #167.
 *
 * 배경: #418 은 React 가 클라이언트 재렌더로 복구하는 **recoverable** 결함이라
 *   - `app/global-error.tsx` (unrecoverable 렌더 에러 전용) 가 못 잡고
 *   - `instrumentation.ts` 의 `onRequestError` (서버 전용) 도 못 잡고
 *   - Sentry GlobalHandlers (uncaught error/rejection) 도 React 가 throw 를
 *     삼키므로 못 잡는다.
 *   → Sentry 가 설정돼 있어도 #418 은 콘솔에만 찍히고 텔레메트리에 0건.
 *     이것이 실원인이 정적 분석·단위 테스트(PR #164)로 좁혀지지 않은 이유.
 *
 * 전략(사용자 결정 2026-05-18: "계측 추가 후 실측"): React 19 는 recoverable
 * hydration mismatch 를 항상 `console.error` 로 내보낸다(프로덕션에선 minified
 * "Minified React error #418; visit https://react.dev/errors/418..." +
 * 이어지는 인자에 컴포넌트 스택). 프레임워크 내부(hydrateRoot
 * onRecoverableError)에 손대지 않고, hydration 직전에 `console.error` 를
 * 한 겹 감싸 해당 시그니처만 가려내 Sentry 로 보고한다. 원본 console.error
 * 동작은 그대로 보존(억제하지 않음).
 *
 * 이 모듈은 진단용이다 — 실측으로 #418 의 실제 mismatch 컴포넌트/텍스트가
 * 확정되면(이슈 #167) 원인을 고친 뒤 제거 또는 영구 관측으로 승격 판단한다.
 */

// React 의 hydration mismatch 계열 minified 에러 코드. 418=서버/클라 텍스트
// 불일치, 419=Suspense, 421=hydration 중 일시중단, 422/423/425=트리 복구 경로.
// react.dev/errors/<code> URL 또는 "Minified React error #<code>" 로 등장.
const HYDRATION_ERROR_CODES = [418, 419, 421, 422, 423, 425];

const HYDRATION_TEXT_SIGNATURES = [
  "hydrat", // "Hydration failed", "error while hydrating", "An error occurred during hydration"
  "did not match", // 비-minified(개발/소스맵) 메시지
  "server html", // "server HTML was replaced"
  "server rendered",
];

/**
 * console.error 인자 배열이 React 의 recoverable hydration mismatch
 * 시그니처(코드 418~425 / react.dev/errors URL / "hydrat" 등)인지 판정.
 * 순수 함수 — 회귀 가드용으로 export(이슈 #167, 테스트 §hydrationErrorReporter).
 */
export function looksLikeHydrationError(args: unknown[]): boolean {
  for (const arg of args) {
    const text =
      typeof arg === "string"
        ? arg
        : arg instanceof Error
          ? `${arg.message}`
          : "";
    if (!text) continue;
    const lower = text.toLowerCase();
    if (HYDRATION_TEXT_SIGNATURES.some((s) => lower.includes(s))) return true;
    for (const code of HYDRATION_ERROR_CODES) {
      if (
        text.includes(`react.dev/errors/${code}`) ||
        text.includes(`Minified React error #${code}`)
      ) {
        return true;
      }
    }
  }
  return false;
}

let installed = false;

/**
 * hydration 직전(= instrumentation-client 로드 시점)에 1회 호출.
 * 중복 설치·재귀 보고를 방지한다.
 */
export function installHydrationErrorReporter(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const original = console.error.bind(console);
  let reporting = false; // Sentry 캡처 중 발생하는 console.error 재귀 차단

  console.error = (...args: unknown[]) => {
    original(...args);

    if (reporting) return;
    if (!looksLikeHydrationError(args)) return;

    reporting = true;
    try {
      // 첫 인자가 Error 면 그대로, 아니면 메시지를 합성. 이어지는 인자에는
      // React 19 가 컴포넌트 스택을 실어 보내므로 extra 로 전부 보존한다.
      const primary = args.find((a) => a instanceof Error) as
        | Error
        | undefined;
      const messageParts = args
        .filter((a) => typeof a === "string")
        .map((a) => a as string);
      const componentStack = messageParts.find(
        (s) => s.includes("\n    at ") || s.includes("\n    in "),
      );

      void import("@sentry/nextjs")
        .then((Sentry) => {
          Sentry.withScope((scope) => {
            scope.setTag("mechanism", "hydration-mismatch");
            scope.setTag("react_recoverable", "true");
            scope.setLevel("error");
            scope.setExtra("consoleArgs", messageParts);
            scope.setExtra("componentStack", componentStack ?? null);
            scope.setExtra("location", window.location.href);
            scope.setExtra(
              "documentLang",
              document.documentElement.lang || null,
            );
            // SW 가설(이슈 #167 §SW stale-chunk) 검증용 — 컨트롤러 유무·스코프
            scope.setExtra(
              "swController",
              typeof navigator !== "undefined" && "serviceWorker" in navigator
                ? navigator.serviceWorker.controller?.scriptURL || "none"
                : "unsupported",
            );
            if (primary) {
              Sentry.captureException(primary);
            } else {
              Sentry.captureMessage(
                `React hydration mismatch (#418 family): ${
                  messageParts[0] ?? "unknown"
                }`,
              );
            }
          });
        })
        .catch(() => {
          /* Sentry 미로딩(DSN 없음) 시 무시 — 원본 console.error 는 이미 출력됨 */
        });
    } finally {
      reporting = false;
    }
  };
}
