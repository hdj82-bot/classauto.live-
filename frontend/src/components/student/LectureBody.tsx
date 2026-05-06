"use client";

import { useI18n } from "@/contexts/I18nContext";
import type { LectureMetaData } from "./LectureMeta";

export interface LectureBodyProps {
  /** Slug for routing into the existing /lecture/[slug] viewer. */
  slug: string;
  /** Lecture metadata; we render lightweight content here. */
  meta: LectureMetaData;
  /** Public video_url from the API. null if not yet rendered or expired. */
  videoUrl: string | null;
}

/**
 * Body shown to a logged-in student on /v/[slug].
 *
 * Scope: this view is the *student-side preview* — it renders the public
 * metadata, plays the public video URL if available, and links into the
 * existing /lecture/[slug] viewer (owned by the legacy professor flow) for
 * the full Q&A / attention experience.
 *
 * We intentionally do NOT duplicate the heavy QA/attention stack that
 * /lecture/[slug] already implements. /v/[slug] is the entry surface; the
 * existing lecture viewer is the player.
 */
export default function LectureBody({ slug, meta, videoUrl }: LectureBodyProps) {
  const { t } = useI18n();

  return (
    <section
      aria-label="lecture-body"
      className="rounded-2xl border border-gray-800 bg-black/40 overflow-hidden"
    >
      <div className="aspect-video bg-black">
        {videoUrl ? (
          <video
            src={videoUrl}
            controls
            preload="metadata"
            poster={meta.thumbnail_url ?? undefined}
            className="w-full h-full"
            aria-label={meta.title}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
            <div className="text-center px-4">
              <svg
                className="w-10 h-10 mx-auto mb-2 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              <p>{t("lecture.videoNotReady")}</p>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 sm:p-6 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <p className="text-sm text-gray-400 line-clamp-2">
          {meta.description ?? t("student.entry.metaPlaceholder")}
        </p>
        <a
          href={`/lecture/${encodeURIComponent(slug)}`}
          className="inline-flex justify-center rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-black hover:bg-amber-400 transition whitespace-nowrap"
        >
          {t("student.entry.openInPlayer")}
        </a>
      </div>
    </section>
  );
}
