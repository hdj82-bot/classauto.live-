"use client";

import { useI18n } from "@/contexts/I18nContext";

export interface LectureMetaData {
  title: string;
  description: string | null;
  thumbnail_url?: string | null;
  professorName?: string | null;
  courseName?: string | null;
  durationSec?: number | null;
}

/**
 * Hero block at the top of /v/[slug]. Renders the lecture title plus the
 * "○○○ 교수님이 보낸 강의입니다" trust line called for in
 * docs/planning/06-student-pages.md §3.1.
 *
 * Pure presentational — does not fetch. The parent page passes data either
 * from the public lectures API or from the mock fallback used in dev when
 * the backend is unreachable.
 */
export default function LectureMeta({ data }: { data: LectureMetaData }) {
  const { t } = useI18n();

  const { title, description, thumbnail_url, professorName, courseName, durationSec } = data;

  // Format duration as e.g. "5분 12초" / "5m 12s". Locale-agnostic enough
  // that we keep one shared rendering instead of two key sets.
  const formatDuration = (sec: number): string => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    if (m === 0) return `${s}s`;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <section
      aria-label="lecture-meta"
      className="rounded-2xl border border-gray-800 bg-gray-900/60 p-6 sm:p-8"
    >
      <p className="text-sm text-gray-400 mb-3">
        {professorName
          ? t("student.entry.fromProfessor", { name: professorName })
          : t("student.entry.fromProfessorAnon")}
      </p>

      <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
        {title}
      </h1>

      {courseName && (
        <p className="mt-2 text-sm text-gray-400">{courseName}</p>
      )}

      {description && (
        <p className="mt-4 text-sm sm:text-base text-gray-300 leading-relaxed">
          {description}
        </p>
      )}

      <div className="mt-5 flex items-center gap-4 text-xs text-gray-500">
        {typeof durationSec === "number" && durationSec > 0 && (
          <span className="tabular-nums" aria-label="duration">
            {formatDuration(durationSec)}
          </span>
        )}
        {thumbnail_url && (
          // We only show the thumbnail as a small dot indicator; the real
          // player handles full preview imagery.
          <span className="inline-flex items-center gap-1 text-gray-500">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" aria-hidden="true" />
            <span>preview</span>
          </span>
        )}
      </div>
    </section>
  );
}
