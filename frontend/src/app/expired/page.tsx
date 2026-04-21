"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/contexts/I18nContext";

export default function ExpiredPage() {
  const router = useRouter();
  const { t } = useI18n();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center max-w-md">
        <div className="text-5xl mb-4" role="presentation">&#x23F0;</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">{t("expired.title")}</h1>
        <p className="text-sm text-gray-500 mb-6">{t("expired.description")}</p>
        <button
          onClick={() => router.push("/dashboard")}
          className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-6 py-2.5 text-sm font-medium transition"
        >
          {t("expired.backToDashboard")}
        </button>
      </div>
    </div>
  );
}
