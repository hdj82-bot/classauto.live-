"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { authApi, bootstrapAuth, userApi } from "@/lib/api";
import { tokens } from "@/lib/tokens";

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: "professor" | "student" | "admin";
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (access: string) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function parseJwt(token: string): Record<string, unknown> | null {
  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch {
    return null;
  }
}

const tokenListeners = new Set<() => void>();
function subscribeTokens(callback: () => void) {
  tokenListeners.add(callback);
  return () => {
    tokenListeners.delete(callback);
  };
}
function notifyTokens() {
  tokenListeners.forEach((cb) => cb());
}

// JWT 에는 sub·role 만 있어 email/name 이 비어 있다. 부트스트랩/로그인 후 /me 로
// 받아온 프로필을 sub 단위로 캐싱해 스냅샷에 병합한다(H4). sub 가 일치할 때만 적용해
// 사용자가 바뀌면 이전 프로필이 새 세션으로 새지 않는다.
let fetchedProfile: { sub: string; email: string; name: string } | null = null;

// 스냅샷 캐시 키 = access 토큰 + 프로필 적용 여부. 둘 다 같으면 같은 참조를 돌려줘
// useSyncExternalStore 가 매 렌더마다 새 객체로 보고 무한 리렌더하는 것을 막는다.
let cachedKey: string | null = null;
let cachedUser: AuthUser | null = null;

function getUserSnapshot(): AuthUser | null {
  const access = tokens.getAccess();
  if (!access) {
    if (cachedKey !== "none") {
      cachedKey = "none";
      cachedUser = null;
    }
    return cachedUser;
  }
  const payload = parseJwt(access);
  if (!payload) {
    if (cachedKey !== "invalid") {
      cachedKey = "invalid";
      cachedUser = null;
    }
    return cachedUser;
  }
  const sub = payload.sub as string;
  const profile =
    fetchedProfile && fetchedProfile.sub === sub ? fetchedProfile : null;
  const key = `${access}|${profile ? "p" : "-"}`;
  if (key === cachedKey) return cachedUser;
  cachedKey = key;
  cachedUser = {
    id: sub,
    email: profile?.email ?? "",
    name: profile?.name ?? "",
    role: payload.role as "professor" | "student" | "admin",
  };
  return cachedUser;
}

// 현재 access 토큰의 사용자 프로필(email·name)을 /me 로 보강한다. 토큰이 없거나 sub 를
// 못 읽으면 조용히 건너뛰고, 실패해도 비차단(JWT 기반 user 로 진행). 성공 시 스냅샷을
// 갱신해 Topbar·플레이어 이름과 분석 PRO/종합보고서 노출 게이트가 채워진다(H4).
async function enrichProfile(): Promise<void> {
  const access = tokens.getAccess();
  if (!access) return;
  const sub = (parseJwt(access)?.sub as string | undefined) ?? null;
  if (!sub) return;
  try {
    const { data } = await userApi.getMe();
    fetchedProfile = { sub: data.id, email: data.email, name: data.name };
    notifyTokens();
  } catch {
    // 비차단 — 보강 실패 시 email/name 은 빈 문자열로 남는다.
  }
}

function getServerUserSnapshot(): AuthUser | null {
  return null;
}

const noopSubscribe = () => () => {};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const user = useSyncExternalStore(
    subscribeTokens,
    getUserSnapshot,
    getServerUserSnapshot,
  );
  // false during SSR and the first hydration render so consumers can show a
  // loading state and skip auth-required redirects until the client snapshot
  // settles.
  const isHydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  // 앱 부팅 시 1회: httpOnly refresh 쿠키로 메모리 access 토큰을 선제 복원.
  // 이게 끝나기 전까지 isLoading=true 로 묶어 ProtectedRoute 가 user=null 을
  // "비로그인" 으로 오판해 /auth/login 으로 튕기는 것을 차단한다.
  // (재방문·새로고침·직접 URL 진입 시 로그인 화면으로 튕기던 버그의 핵심 수정)
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    let cancelled = false;
    bootstrapAuth()
      .then(() => {
        if (cancelled) return;
        notifyTokens(); // 복원된 토큰을 user 스냅샷에 반영
        // 복원된 access 가 있으면 /me 로 email·name 을 보강한다(H4). 비차단.
        return enrichProfile();
      })
      .finally(() => {
        if (!cancelled) setBootstrapped(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback((access: string) => {
    tokens.set(access);
    notifyTokens();
    // 로그인 직후에도 email·name 을 채운다(JWT 엔 sub·role 뿐). 비차단.
    void enrichProfile();
  }, []);

  const logout = useCallback(async () => {
    // refresh 쿠키는 서버가 만료 처리 (withCredentials 로 쿠키 전달됨)
    await authApi.logout().catch(() => null);
    tokens.clear();
    fetchedProfile = null; // 다음 사용자에게 이전 신원이 새지 않도록 초기화
    notifyTokens();
    window.location.href = "/auth/login";
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isLoading: !isHydrated || !bootstrapped, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/**
 * Provider 없이 호출돼도 throw 하지 않고 null 을 반환하는 변형. 마케팅
 * 셸처럼 인증 상태가 "있으면 활용, 없으면 비로그인 UI" 인 부드러운 분기에
 * 쓴다. ProtectedRoute 처럼 인증이 필수인 곳에서는 그대로 `useAuth` 사용.
 *
 * 도입 배경 (2026-05-21, PR #196): LightMarketingShell 이 `/` 헤더의
 * "로그인 / 로그아웃" 분기를 위해 인증 상태를 읽게 되면서, `<AuthProvider>`
 * 를 wrap 하지 않는 기존 marketing 페이지 vitest 들(landing/features/
 * pricing/legal/marketing 등 8개 파일, 67개 테스트)이 "useAuth must be used
 * within AuthProvider" 로 일괄 실패했다. 테스트 setup 을 일일이 손대는 대신
 * 컴포넌트 측에 폴백 경로를 제공한다.
 */
export function useOptionalAuth(): AuthContextValue | null {
  return useContext(AuthContext);
}
