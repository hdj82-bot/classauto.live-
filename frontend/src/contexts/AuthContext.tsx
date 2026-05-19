"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { authApi, bootstrapAuth } from "@/lib/api";
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

let cachedAccess: string | null | undefined = undefined;
let cachedUser: AuthUser | null = null;

function getUserSnapshot(): AuthUser | null {
  const access = tokens.getAccess();
  if (access === cachedAccess) return cachedUser;
  cachedAccess = access;
  if (!access) {
    cachedUser = null;
    return null;
  }
  const payload = parseJwt(access);
  if (!payload) {
    cachedUser = null;
    return null;
  }
  cachedUser = {
    id: payload.sub as string,
    email: "",
    name: "",
    role: payload.role as "professor" | "student" | "admin",
  };
  return cachedUser;
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
    bootstrapAuth().finally(() => {
      if (cancelled) return;
      notifyTokens(); // 복원된 토큰을 user 스냅샷에 반영
      setBootstrapped(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback((access: string) => {
    tokens.set(access);
    notifyTokens();
  }, []);

  const logout = useCallback(async () => {
    // refresh 쿠키는 서버가 만료 처리 (withCredentials 로 쿠키 전달됨)
    await authApi.logout().catch(() => null);
    tokens.clear();
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
