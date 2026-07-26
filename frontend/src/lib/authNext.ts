/**
 * OAuth 라운드트립을 건너 살아남는 딥링크(next).
 *
 * 학생이 강좌 QR 을 스캔하면 `/c/[slug]` 에 도착하는데, 로그인하러 나갔다가
 * 돌아올 때 원래 주소를 잃으면 **등록(join)이 영영 호출되지 않는다.** 학기 초
 * 첫 수업에서 40명이 스캔하는 바로 그 경로라, 잃어버리면 그 학기 명단이 빈다.
 *
 * 왜 sessionStorage 인가: 프로젝트 규칙상 localStorage 는 쓰지 않고, OAuth 는
 * same-tab 리다이렉트라 프론트 origin 의 sessionStorage 가 왕복 후에도 남는다.
 * URL 쿼리로 나르지 않는 이유는 백엔드 OAuth state 가 임의 파라미터를 되돌려
 * 주지 않기 때문이다.
 *
 * 복귀 지점이 **두 곳**이라는 게 핵심이다:
 *   - 신규 가입   → `/auth/complete-profile`
 *   - 기존 계정   → `/auth/callback`
 * 한쪽만 읽으면 "이미 계정이 있는 학생"이 조용히 대시보드로 떨어져 등록되지 않는다.
 */
const STUDENT_NEXT_KEY = "ifl_student_signup_next";

/** 내부 경로만 허용 — open-redirect 방어('//' 는 프로토콜 상대 URL). */
function isSafeInternalPath(value: string | null): value is string {
  return !!value && value.startsWith("/") && !value.startsWith("//");
}

/** OAuth 로 나가기 직전에 돌아올 주소를 보관한다. */
export function stashAuthNext(path: string | null | undefined): void {
  if (typeof window === "undefined") return;
  try {
    if (isSafeInternalPath(path ?? null)) {
      window.sessionStorage.setItem(STUDENT_NEXT_KEY, path as string);
    } else {
      window.sessionStorage.removeItem(STUDENT_NEXT_KEY);
    }
  } catch {
    /* 사파리 프라이빗 모드 등 — 딥링크만 잃고 로그인은 계속된다. */
  }
}

/**
 * 보관된 주소를 **꺼내며 지운다**(1회용).
 *
 * 지우지 않으면 다음 로그인 때 엉뚱한 강좌로 튄다.
 */
export function takeAuthNext(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stashed = window.sessionStorage.getItem(STUDENT_NEXT_KEY);
    window.sessionStorage.removeItem(STUDENT_NEXT_KEY);
    return isSafeInternalPath(stashed) ? stashed : null;
  } catch {
    return null;
  }
}
