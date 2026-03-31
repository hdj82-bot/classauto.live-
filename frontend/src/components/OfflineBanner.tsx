"use client";

import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export default function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div className="fixed top-0 inset-x-0 z-50 bg-red-600 text-white text-center text-sm py-2 font-medium">
      인터넷 연결이 끊어졌습니다. 연결 상태를 확인해주세요.
    </div>
  );
}
