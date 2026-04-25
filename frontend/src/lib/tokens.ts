// Access token 은 XSS 노출 최소화를 위해 localStorage 가 아닌
// 모듈 스코프 변수에만 보관한다. 페이지 리로드 시 휘발되며, 그때는
// httpOnly 쿠키에 담긴 refresh 로 /api/auth/refresh 에서 새 access 를 받는다.
// refresh_token 은 프론트에서 직접 접근하지 않는다 (쿠키는 HttpOnly).

let _access: string | null = null;

export const tokens = {
  getAccess: (): string | null => _access,

  set: (access: string): void => {
    _access = access;
  },

  clear: (): void => {
    _access = null;
  },
};
