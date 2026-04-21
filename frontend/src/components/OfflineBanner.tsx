"use client";

import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useI18n } from "@/contexts/I18nContext";

export default function OfflineBanner() {
  const online = useOnlineStatus();
  const { t } = useI18n();
  if (online) return null;
  return (
    <div role="alert" className="fixed top-0 inset-x-0 z-50 bg-red-600 text-white text-center text-sm py-2 font-medium">
      {t("common.offline")}
    </div>
  );
}
