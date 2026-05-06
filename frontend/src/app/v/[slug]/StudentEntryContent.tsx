"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import axios from "axios";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import LectureMeta, { type LectureMetaData } from "@/components/student/LectureMeta";
import EntryCTA from "@/components/student/EntryCTA";
import LectureBody from "@/components/student/LectureBody";
import OnboardingModal from "@/components/student/OnboardingModal";

// Mirrors LecturePublicResponse on the backend; we duplicate the shape here
// rather than importing a TS schema (none generated yet) to keep the surface
// explicit. Any drift will surface as a TS or runtime error in tests.
interface PublicLecture {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  slug: string;
  is_expired: boolean;
  video_url: string | null;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "ok"; data: PublicLecture; mocked: boolean }
  | { kind: "not-found" };

const mockLecture = (slug: string): PublicLecture => ({
  id: "mock-id",
  course_id: "mock-course-id",
  title: "디지털 위안화의 이해",
  description:
    "현대중국사회의이해 3주차 — 중앙은행 디지털 통화(CBDC) 도입 배경과 한국 사회에 미치는 영향.",
  thumbnail_url: null,
  slug,
  is_expired: false,
  video_url: null,
});

export default function StudentEntryContent() {
  const params = useParams<{ slug: string | string[] }>();
  // useParams may give us string[] for catch-all routes or undefined when the
  // segment is missing; normalize to a single string.
  const slug = Array.isArray(params?.slug) ? params.slug[0] : params?.slug;
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { t } = useI18n();

  // Initial state is derived synchronously from `slug` so we never call
  // setState inside the effect to handle the missing-segment case (React 19
  // react-hooks/set-state-in-effect rule).
  const [state, setState] = useState<LoadState>(() =>
    slug ? { kind: "loading" } : { kind: "not-found" },
  );

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get<PublicLecture>(
          `/api/lectures/${encodeURIComponent(slug)}/public`,
        );
        if (cancelled) return;
        if (data.is_expired) {
          router.replace("/expired");
          return;
        }
        setState({ kind: "ok", data, mocked: false });
      } catch (err) {
        if (cancelled) return;
        // 404 / explicit "not found" stays as not-found.
        if (axios.isAxiosError(err) && err.response?.status === 404) {
          setState({ kind: "not-found" });
          return;
        }
        // Network/CORS/dev-server-down → mock fallback so the route still
        // renders something useful in dev. Production builds disable the
        // fallback to avoid masking real outages.
        if (process.env.NODE_ENV !== "production") {
          setState({ kind: "ok", data: mockLecture(slug), mocked: true });
          return;
        }
        setState({ kind: "not-found" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, router]);

  const meta: LectureMetaData | null = useMemo(() => {
    if (state.kind !== "ok") return null;
    return {
      title: state.data.title,
      description: state.data.description,
      thumbnail_url: state.data.thumbnail_url,
      // Public endpoint does not expose the professor name; we show the
      // anonymous trust line. When the backend adds it (see BACKEND_ASKS.W4)
      // this falls through automatically.
      professorName: null,
      courseName: null,
      durationSec: null,
    };
  }, [state]);

  // Loading: a calm dark spinner that respects prefers-reduced-motion.
  if (state.kind === "loading" || authLoading) {
    return (
      <main className="min-h-screen bg-[#0A0A0A] text-white flex items-center justify-center px-4">
        <p className="text-sm text-gray-400" role="status">
          {t("student.entry.loadingLecture")}
        </p>
      </main>
    );
  }

  if (state.kind === "not-found" || !slug) {
    return (
      <main className="min-h-screen bg-[#0A0A0A] text-white flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-bold mb-2">
            {t("student.entry.lectureNotFoundTitle")}
          </h1>
          <p className="text-sm text-gray-400 mb-6">
            {t("student.entry.lectureNotFoundDesc")}
          </p>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-black hover:bg-amber-400 transition"
          >
            {t("student.entry.backToHome")}
          </button>
        </div>
      </main>
    );
  }

  // state.kind === "ok"
  const isStudent = user?.role === "student";

  return (
    <main className="min-h-screen bg-[#0A0A0A] text-white">
      <div className="max-w-3xl mx-auto px-4 py-10 sm:py-16 space-y-6">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span className="font-semibold tracking-wider">CLASSAUTO</span>
          {state.mocked && (
            <span
              className="rounded-full border border-amber-700 bg-amber-900/40 px-2 py-0.5 text-amber-300"
              role="note"
            >
              dev mock
            </span>
          )}
        </div>

        {meta && <LectureMeta data={meta} />}

        {isStudent ? (
          <>
            <LectureBody
              slug={slug}
              meta={meta!}
              videoUrl={state.data.video_url}
            />
            <OnboardingModal initialName={user?.name ?? ""} />
          </>
        ) : (
          <EntryCTA signupHref={`/auth/signup?next=${encodeURIComponent(`/v/${slug}`)}`} />
        )}
      </div>
    </main>
  );
}
