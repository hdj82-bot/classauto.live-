import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { tokens } from "./tokens";

// NEXT_PUBLIC_API_URL 은 빌드 타임에 인라인된다. production 빌드에 누락된 채로
// 배포되면 클라이언트가 localhost:8000 으로 호출해 무한 실패 + 잘못된 호스트로
// 토큰 전송 위험. 그래서:
//   - 환경변수가 있으면 그대로 사용
//   - 없으면 dev 또는 SSR/빌드(window 없음) 에서는 localhost 폴백 (빌드 깨지지 않게)
//   - 클라이언트 런타임 + production 이면 즉시 throw → 잘못된 호스트로 토큰 새는 사고 차단
function resolveApiUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  if (typeof window !== "undefined" && process.env.NODE_ENV === "production") {
    throw new Error(
      "NEXT_PUBLIC_API_URL is not set. Configure it before building for production.",
    );
  }
  return "http://localhost:8000";
}

export const API_URL = resolveApiUrl();

// withCredentials: true — 백엔드가 내려보낸 ifl_refresh (httpOnly, Path=/api/auth)
// 쿠키를 /api/auth/* 요청에 자동 첨부시킨다.
export const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

// 요청 인터셉터: Authorization 헤더 자동 첨부
api.interceptors.request.use((config) => {
  const token = tokens.getAccess();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// 동시 401 race 방지: 진행 중인 refresh 가 있으면 같은 promise 를 재사용해
// 한 번만 백엔드를 호출하고 모든 대기 요청이 같은 새 토큰을 사용하게 한다.
// 실패 시 캐시 무효화 + 한 번만 로그아웃 처리.
let refreshPromise: Promise<string> | null = null;
let loggedOutOnce = false;

async function refreshAccessToken(): Promise<string> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = axios
    .post<{ access_token: string }>(
      `${API_URL}/api/auth/refresh`,
      null,
      { withCredentials: true },
    )
    .then(({ data }) => {
      tokens.set(data.access_token);
      return data.access_token;
    })
    .finally(() => {
      // 성공/실패 모두 캐시 비워야 다음 401 사이클에서 새 promise 발급
      refreshPromise = null;
    });
  return refreshPromise;
}

type RetriableRequest = InternalAxiosRequestConfig & { _retry?: boolean };

// 응답 인터셉터: 401 시 refresh 쿠키로 재발급 시도
api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as RetriableRequest | undefined;
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      try {
        const access = await refreshAccessToken();
        original.headers.Authorization = `Bearer ${access}`;
        return api(original);
      } catch (refreshError) {
        tokens.clear();
        if (!loggedOutOnce && typeof window !== "undefined") {
          loggedOutOnce = true;
          window.location.href = "/auth/login";
        }
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  },
);

// 네트워크/서버 에러 시 커스텀 이벤트 발행 → ToastProvider가 수신
api.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    if (typeof window !== "undefined") {
      const msg = !error.response
        ? "서버에 연결할 수 없습니다."
        : error.response.status >= 500
          ? "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
          : null;
      if (msg) window.dispatchEvent(new CustomEvent("api-error", { detail: msg }));
    }
    return Promise.reject(error);
  },
);

// Stripe 공식 checkout 호스트만 허용. 그 외 host 로의 redirect 는
// open-redirect 공격으로 간주하고 차단한다 (백엔드 응답이 변조되거나
// payment provider 가 바뀌었을 때의 방어선).
export function isStripeCheckoutUrl(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length === 0) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return url.protocol === "https:" && url.hostname === "checkout.stripe.com";
}

// ── OAuth state (CSRF 방어) ────────────────────────────────────────────────
// 백엔드 자체 state 검증을 100% 신뢰하지 못하는 상황에서 프론트가 1회용
// state 를 sessionStorage 에 발급해 콜백에서 일치 확인.
const OAUTH_STATE_KEY = "ifl_oauth_state";

function randomState(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // jsdom 등 fallback
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const oauthState = {
  // 로그인 시작 시 발급. redirect URL 의 state 쿼리에 동봉.
  issue(): string {
    const state = randomState();
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(OAUTH_STATE_KEY, state);
    }
    return state;
  },
  // 콜백에서 1회 검증. 검증 후 즉시 무효화 (재사용 방지).
  consume(received: string | null): { ok: boolean; reason?: "missing" | "mismatch" | "absent" } {
    if (typeof window === "undefined") return { ok: false, reason: "absent" };
    const expected = window.sessionStorage.getItem(OAUTH_STATE_KEY);
    if (!expected) return { ok: false, reason: "absent" };
    window.sessionStorage.removeItem(OAUTH_STATE_KEY);
    if (!received) return { ok: false, reason: "missing" };
    if (received !== expected) return { ok: false, reason: "mismatch" };
    return { ok: true };
  },
  // 진입 시 sessionStorage 에 state 가 없는 경우 (백엔드만 검증) 도
  // 알 수 있도록 별도 helper. 호출자가 신뢰 정책을 결정한다.
  hasIssued(): boolean {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem(OAUTH_STATE_KEY) !== null;
  },
};

// 로그인 페이지에서 import. state 발급 후 백엔드 OAuth 시작 URL 로 redirect.
export function startGoogleLogin(role: "professor" | "student"): void {
  const state = oauthState.issue();
  const url = new URL(`${API_URL}/api/auth/google`);
  url.searchParams.set("role", role);
  url.searchParams.set("state", state);
  window.location.href = url.toString();
}

export const authApi = {
  exchange: (code: string, state?: string) =>
    api.post<{ access_token: string }>("/api/auth/exchange", { code, state }),

  tempExchange: (temp_code: string) =>
    api.post<{
      temp_token: string;
      email: string;
      name: string;
      role: "professor" | "student";
    }>("/api/auth/temp-exchange", { temp_code }),

  completeProfile: (body: {
    temp_token: string;
    school?: string;
    department?: string;
    student_number?: string;
  }) => api.post<{ access_token: string }>("/api/auth/complete-profile", body),

  // refresh_token 쿠키는 서버가 만료 처리하므로 body 불필요
  logout: () => api.delete("/api/auth/logout"),
};
