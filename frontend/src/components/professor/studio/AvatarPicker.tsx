"use client";

import { useStudioI18n } from "./useStudioI18n";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import type { HeyGenAvatar } from "./studioTypes";

interface AvatarPickerProps {
  avatars: readonly HeyGenAvatar[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function AvatarPicker({
  avatars,
  loading,
  error,
  selectedId,
  onSelect,
}: AvatarPickerProps) {
  const { t } = useStudioI18n();

  if (loading) {
    return (
      <div className="py-8">
        <LoadingSpinner label={t("step3.avatarLoading")} />
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3"
      >
        {t("step3.avatarError")}
      </div>
    );
  }

  if (avatars.length === 0) {
    return (
      <p className="text-sm text-gray-500 py-4">{t("step3.avatarEmpty")}</p>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label={t("step3.avatarSection")}
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
    >
      {avatars.map((a) => {
        const isSelected = a.id === selectedId;
        return (
          <button
            key={a.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onSelect(a.id)}
            className={`group relative rounded-xl border-2 overflow-hidden transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
              isSelected
                ? "border-indigo-500"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <div className="aspect-square bg-gray-100">
              {a.preview_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={a.preview_image_url}
                  alt={a.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-3xl text-gray-300">
                  {a.name.slice(0, 1)}
                </div>
              )}
            </div>
            <div className="px-2 py-1.5 text-left">
              <p className="text-xs font-medium text-gray-900 truncate">
                {a.name}
              </p>
              {a.gender && (
                <p className="text-[10px] text-gray-400">{a.gender}</p>
              )}
            </div>
            {isSelected && (
              <span
                aria-hidden="true"
                className="absolute top-1.5 right-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold"
              >
                ✓
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
