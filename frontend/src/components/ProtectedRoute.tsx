"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { isOwnerEmail } from "@/lib/ownerAccess";

interface Props {
  children: React.ReactNode;
  allowedRoles?: ("professor" | "student" | "admin")[];
  // 운영자(ADMIN_EMAILS)는 role 과 무관하게 통과시킨다(관리자 콘솔). 계정주가 교수자
  // 계정이어도 role 을 admin 으로 바꾸지 않고 콘솔을 쓰게 하기 위함. 실경계는 백엔드.
  allowOwner?: boolean;
}

// SSR 단계에서는 access token / 쿠키 상태를 확실히 알 수 없어, 서버가 children
// 을 prerender 했다가 클라이언트가 마운트되면서 빈 화면으로 한 프레임 깜빡이는
// 현상이 발생한다. useSyncExternalStore 의 server snapshot 은 false, client
// snapshot 은 true 이므로 hydration mismatch 없이 "mounted" 상태를 표현할 수
// 있다 (setState-in-effect 패턴 회피).
const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export default function ProtectedRoute({ children, allowedRoles, allowOwner }: Props) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const mounted = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);

  const roleAllowed = !allowedRoles || (user != null && allowedRoles.includes(user.role));
  const ownerAllowed = !!allowOwner && user != null && isOwnerEmail(user.email);
  // allowOwner 인데 email(/me 보강)이 아직 비어 있으면 운영자 판정을 보류한다 — 빈
  // 문자열로 단정해 운영자를 잘못 리다이렉트하지 않게(프로필 로드 대기).
  const ownerPending =
    !!allowOwner && user != null && !roleAllowed && !user.email;
  const allowed = roleAllowed || ownerAllowed;

  useEffect(() => {
    if (!mounted || isLoading) return;
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    if (!allowed && !ownerPending) {
      router.replace("/dashboard");
    }
  }, [mounted, user, isLoading, allowed, ownerPending, router]);

  if (!mounted || isLoading) return <LoadingSpinner fullScreen label="..." />;
  if (!user) return null;
  if (ownerPending) return <LoadingSpinner fullScreen label="..." />;
  if (!allowed) return null;

  return <>{children}</>;
}
