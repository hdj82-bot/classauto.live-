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

// 앱 부팅 시 1회 호출. access 토큰은 메모리 전용(tokens.ts)이라 풀 페이지
// 로드·재방문·직접 URL 진입 때마다 휘발된다. 이때 httpOnly refresh 쿠키로
// access 를 선제 복원해야 ProtectedRoute 가 user=null 로 오판해 곧장
// /auth/login 으로 튕기는 일을 막을 수 있다. 401 인터셉터는 "API 호출이
// 일어난 뒤"에만 동작하므로 가드가 먼저 이탈시키는 경로를 못 막는다.
// 성공/실패 모두 resolve — 실패(쿠키 없음·만료)는 그냥 비로그인 상태로 진행.
export async function bootstrapAuth(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (tokens.getAccess()) return true;
  try {
    await refreshAccessToken();
    return true;
  } catch {
    return false;
  }
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

// ── Google OAuth 시작 ──────────────────────────────────────────────────────
// CSRF state 는 백엔드가 Redis 로 단독 발급·검증한다 (2026-05-12 OAuth
// invalid_state 수정 — frontend state 레이어 제거, 백엔드 단일 검증 일원화).
// 따라서 프론트는 1회용 state 를 발급하지 않고, role 만 붙여 백엔드 시작
// 엔드포인트로 redirect 한다 (backend/app/api/v1/auth.py `google_login` 은
// state 쿼리를 받지 않고 자체 uuid 를 Redis 에 저장한다).
//
// 과거 세션이 sessionStorage 에 남긴 `ifl_oauth_state` 잔재는 이제 읽는
// 코드가 없어 자연히 무시되며(탭 종료 시 sessionStorage 와 함께 소멸),
// 별도 정리(removeItem) 코드를 두지 않는다 — careful drop: 정리 코드를
// 추가하면 도리어 죽은 키를 다시 참조하는 셈이라 silent ignore 가 정답.
export function startGoogleLogin(role: "professor" | "student"): void {
  const url = new URL(`${API_URL}/api/auth/google`);
  url.searchParams.set("role", role);
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
    // G(스펙 13): 교수자 베타 모니터링 동의. 백엔드가 교수자 가입 시 필수로 검증한다
    // (미동의 422). 학생 가입은 이 값과 무관.
    beta_consented?: boolean;
  }) => api.post<{ access_token: string }>("/api/auth/complete-profile", body),

  // refresh_token 쿠키는 서버가 만료 처리하므로 body 불필요
  logout: () => api.delete("/api/auth/logout"),

  // 초대 랜딩 페이지용 — 토큰으로 초대 대상 이메일·상태 조회 (토큰 보유자 공개).
  inviteInfo: (token: string) =>
    api.get<{ email: string; role: string; status: string }>(
      `/api/auth/invite/${encodeURIComponent(token)}`,
    ),
};

export interface OwnerInvite {
  id: string;
  token: string;
  email: string;
  role: string;
  status: "active" | "used" | "expired";
  invite_url: string;
  created_at: string;
  expires_at: string | null;
  used_at: string | null;
}

// 계정주(운영자) 전용 — 교수자 초대 발급/목록/취소. 백엔드 require_owner 가
// ADMIN_EMAILS 로 권한을 강제하므로, 비운영자가 호출하면 403 이 떨어진다.
export const ownerInviteApi = {
  list: () => api.get<OwnerInvite[]>("/api/owner/invites"),
  create: (email: string) =>
    api.post<OwnerInvite>("/api/owner/invites", { email }),
  revoke: (id: string) =>
    api.delete(`/api/owner/invites/${encodeURIComponent(id)}`),
};

// 계정주(운영자) 전용 — API 비용 대시보드. 백엔드 require_owner(ADMIN_EMAILS)
// 가 권한을 강제하므로 비운영자가 호출하면 403.
export interface OwnerCostServiceRow {
  service: string;
  cost_usd: number;
  calls: number;
  seconds: number;
  tokens: number;
}

export interface OwnerCostUserRow {
  user_id: string;
  email: string | null;
  name: string | null;
  role: string | null;
  total_usd: number;
  calls: number;
  /** 종목(service) → 비용(USD). 미사용 종목은 키 자체가 없음. */
  by_service: Record<string, number>;
}

export interface OwnerCostsResponse {
  generated_at: string;
  window_days: number;
  currency: string;
  total_cost_usd: number;
  month_to_date_usd: number;
  user_count: number;
  /** 사용자 표의 컬럼 집합 — 비용 내림차순 종목 키. */
  services: string[];
  by_service: OwnerCostServiceRow[];
  by_month: { year: number; month: number; cost_usd: number }[];
  by_user: OwnerCostUserRow[];
}

export const ownerCostsApi = {
  get: () => api.get<OwnerCostsResponse>("/api/owner/costs"),
};

export interface MeResponse {
  id: string;
  role: "professor" | "student" | "admin";
  /** 온보딩 안내를 "다시 보지 않기" 한 시각. null = 아직(진입 시 안내 표시). */
  onboarded_at: string | null;
}

export const userApi = {
  getMe: () => api.get<MeResponse>("/api/v1/users/me"),
  /** 온보딩 안내 영구 스킵(다시 보지 않기). */
  markOnboarded: () => api.post<MeResponse>("/api/v1/users/me/onboarded"),
};

export interface FeedbackItem {
  id: string;
  user_id: string | null;
  user_email: string | null;
  role: string;
  category: string;
  message: string;
  lecture_id: string | null;
  page: string | null;
  status: "open" | "triaged" | "resolved";
  created_at: string;
}

// 인앱 피드백(스펙 13 · F). 제출은 로그인 유저(교수/학생) 공통, 목록/상태변경은
// 운영자 전용(백엔드 require_admin 강제).
export const feedbackApi = {
  submit: (body: {
    category: string;
    message: string;
    lecture_id?: string;
    page?: string;
  }) => api.post<FeedbackItem>("/api/v1/feedback", body),
  adminList: (params: { page?: number; status?: string; category?: string; role?: string }) =>
    api.get<{ total: number; page: number; limit: number; feedback: FeedbackItem[] }>(
      "/api/v1/admin/feedback",
      { params },
    ),
  adminSetStatus: (id: string, status: string) =>
    api.patch<FeedbackItem>(`/api/v1/admin/feedback/${encodeURIComponent(id)}`, { status }),
};

export interface AuditLogItem {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  detail: Record<string, unknown> | null;
  created_at: string | null;
}

// 운영자 감사 로그(스펙 13 · E) — 읽기 전용. require_admin.
export const auditApi = {
  list: (params: { page?: number; action?: string; actor?: string }) =>
    api.get<{ total: number; page: number; limit: number; logs: AuditLogItem[] }>(
      "/api/v1/admin/audit",
      { params },
    ),
};
