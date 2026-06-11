import { API_URL } from "./api";

// 로그인 페이지에서 호출하는 단일 진입점.
//   1) URL 빌더 — role 만 정해진 형식으로 추가
//   2) Same-origin 검증 — 빌드된 URL 의 origin 이 API_URL 의 origin 과
//      정확히 일치하는지 확인 (open-redirect 방어)
//   3) Redirect 실행
//
// CSRF state 는 백엔드에서 발급·검증한다 (Redis getdel + 10분 TTL).
// 프론트가 별도 state 를 발급하던 이전 구현은 콜백 redirect URL 에
// state 를 echo 하지 않아 항상 invalid_state 로 실패했음.
export function startGoogleLogin(
  role: "professor" | "student",
  invite?: string,
): void {
  if (typeof window === "undefined") return;

  const expectedOrigin = new URL(API_URL).origin;
  const target = new URL(`${API_URL}/api/auth/google`);

  if (target.origin !== expectedOrigin) {
    throw new Error(
      `startGoogleLogin: refusing to redirect — target origin ${target.origin} ` +
        `does not match API_URL origin ${expectedOrigin}.`,
    );
  }

  target.searchParams.set("role", role);
  // 교수자 초대 가입 — 초대 토큰을 함께 전달(백엔드 state 에 보관 후 검증).
  if (invite) target.searchParams.set("invite", invite);
  window.location.href = target.toString();
}
