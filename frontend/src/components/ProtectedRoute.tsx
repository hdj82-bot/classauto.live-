"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

interface Props {
  children: React.ReactNode;
  allowedRoles?: ("professor" | "student" | "admin")[];
}

// SSR 단계에서는 access token / 쿠키 상태를 확실히 알 수 없어, 서버가 children
// 을 prerender 했다가 클라이언트가 마운트되면서 빈 화면으로 한 프레임 깜빡이는
// 현상이 발생한다. useSyncExternalStore 의 server snapshot 은 false, client
// snapshot 은 true 이므로 hydration mismatch 없이 "mounted" 상태를 표현할 수
// 있다 (setState-in-effect 패턴 회피).
const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export default function ProtectedRoute({ children, allowedRoles }: Props) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const mounted = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);

  useEffect(() => {
    if (!mounted || isLoading) return;
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    if (allowedRoles && !allowedRoles.includes(user.role)) {
      router.replace("/dashboard");
    }
  }, [mounted, user, isLoading, allowedRoles, router]);

  if (!mounted || isLoading) return <LoadingSpinner fullScreen label="..." />;
  if (!user) return null;
  if (allowedRoles && !allowedRoles.includes(user.role)) return null;

  return <>{children}</>;
}
