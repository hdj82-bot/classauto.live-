import axios from "axios";
import { tokens } from "./tokens";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const api = axios.create({
  baseURL: BACKEND_URL,
  headers: { "Content-Type": "application/json" },
});

// 요청 인터셉터: Authorization 헤더 자동 첨부
api.interceptors.request.use((config) => {
  const token = tokens.getAccess();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// 응답 인터셉터: 401 시 Refresh Token으로 재발급
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refresh = tokens.getRefresh();
      if (!refresh) {
        tokens.clear();
        window.location.href = "/auth/login";
        return Promise.reject(error);
      }
      try {
        const { data } = await axios.post(`${BACKEND_URL}/api/auth/refresh`, {
          refresh_token: refresh,
        });
        tokens.set(data.access_token, data.refresh_token);
        original.headers.Authorization = `Bearer ${data.access_token}`;
        return api(original);
      } catch {
        tokens.clear();
        window.location.href = "/auth/login";
      }
    }
    return Promise.reject(error);
  }
);

// 네트워크/서버 에러 시 커스텀 이벤트 발행 → ToastProvider가 수신
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (typeof window !== "undefined") {
      const msg = !error.response
        ? "서버에 연결할 수 없습니다."
        : error.response.status >= 500
          ? "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
          : null;
      if (msg) window.dispatchEvent(new CustomEvent("api-error", { detail: msg }));
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  exchange: (code: string) =>
    api.post<{ access_token: string; refresh_token: string }>(
      "/api/auth/exchange",
      { code },
    ),

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
  }) => api.post<{ access_token: string; refresh_token: string }>("/api/auth/complete-profile", body),

  logout: (refresh_token: string) =>
    api.delete("/api/auth/logout", { data: { refresh_token } }),
};
