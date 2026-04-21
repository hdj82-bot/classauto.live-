"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
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
  login: (access: string, refresh: string) => void;
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const access = tokens.getAccess();
    if (access) {
      const payload = parseJwt(access);
      if (payload) {
        setUser({
          id: payload.sub as string,
          email: "",
          name: "",
          role: payload.role as "professor" | "student" | "admin",
        });
      }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback((access: string, refresh: string) => {
    tokens.set(access, refresh);
    const payload = parseJwt(access);
    if (payload) {
      setUser({
        id: payload.sub as string,
        email: "",
        name: "",
        role: payload.role as "professor" | "student" | "admin",
      });
    }
  }, []);

  const logout = useCallback(async () => {
    const refresh = tokens.getRefresh();
    if (refresh) {
      await authApi.logout(refresh).catch(() => null);
    }
    tokens.clear();
    setUser(null);
    window.location.href = "/auth/login";
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
