"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

interface Props {
  children: React.ReactNode;
  allowedRoles?: ("professor" | "student")[];
}

export default function ProtectedRoute({ children, allowedRoles }: Props) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/auth/login");
    }
    if (!isLoading && user && allowedRoles && !allowedRoles.includes(user.role)) {
      router.replace("/dashboard");
    }
  }, [user, isLoading, allowedRoles, router]);

  if (isLoading) return <LoadingSpinner fullScreen label="로딩 중..." />;
  if (!user) return null;
  if (allowedRoles && !allowedRoles.includes(user.role)) return null;

  return <>{children}</>;
}
