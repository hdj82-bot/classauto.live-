"use client";

import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
} from "react";
import { authApi } from "@/lib/api";
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
      value={{ user, isLoading: !isHydrated, login, logout }}
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
