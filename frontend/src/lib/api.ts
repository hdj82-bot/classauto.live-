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

export const authApi = {
  completeProfile: (body: {
    temp_token: string;
    school?: string;
    department?: string;
    student_number?: string;
  }) => api.post<{ access_token: string; refresh_token: string }>("/api/auth/complete-profile", body),

  logout: (refresh_token: string) =>
    api.delete("/api/auth/logout", { data: { refresh_token } }),
};
