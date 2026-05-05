import { API_URL, oauthState } from "./api";

// 로그인 페이지에서 호출하는 단일 진입점. 다음 책임을 한 곳에서 처리한다.
//   1) URL 빌더 — role / state 를 정해진 형식으로만 추가 (수동 문자열 보간 X)
//   2) Same-origin 검증 — 빌드된 URL 의 origin 이 API_URL 의 origin 과 정확히
//      일치하는지 확인. 누군가 process.env.NEXT_PUBLIC_API_URL 을 변조하거나
//      해당 모듈을 임의로 monkey-patch 해도 외부 origin 으로 redirect 되지 않음.
//   3) OAuth state(CSRF) 발급 — sessionStorage 에 1회용 토큰 저장 후 query 동봉.
//   4) Redirect 실행.
//
// LoginContent 등 호출자는 이 helper 한 줄만 호출하면 된다.
export function startGoogleLogin(role: "professor" | "student"): void {
  if (typeof window === "undefined") {
    // SSR 단계에서 호출되면 무의미한 redirect 가 되므로 조용히 무시.
    return;
  }

  const expectedOrigin = new URL(API_URL).origin;
  const target = new URL(`${API_URL}/api/auth/google`);

  // 빌드 직후 origin 이 일치하는지 한 번 더 검증 — URL 생성이 어떤 이유로
  // 외부 host 를 가리키게 됐다면 redirect 를 차단.
  if (target.origin !== expectedOrigin) {
    throw new Error(
      `startGoogleLogin: refusing to redirect — target origin ${target.origin} ` +
        `does not match API_URL origin ${expectedOrigin}.`,
    );
  }

  const state = oauthState.issue();
  target.searchParams.set("role", role);
  target.searchParams.set("state", state);

  window.location.href = target.toString();
}
