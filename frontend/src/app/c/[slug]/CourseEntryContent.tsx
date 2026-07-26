"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import axios from "axios";
import { api, enrollmentApi } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { startGoogleLogin } from "@/lib/auth";
import { stashAuthNext } from "@/lib/authNext";
import StudentSurfaceLight from "@/components/student/v2/StudentSurfaceLight";
import FeedbackLauncher from "@/components/feedback/FeedbackLauncher";

/**
 * `/c/[slug]` 본문 — 강좌 정보 → 로그인 → 자동 등록 → 발행 강의 목록.
 *
 * 흐름이 `/v/[slug]` 와 다른 점은 **머무는 화면**이라는 것이다. `/v/[slug]` 는 로그인한
 * 학생을 곧장 플레이어로 넘기지만, 여기는 강의가 여러 개라 목록을 보여주고 학생이 고른다.
 * 학기 내내 이 주소가 학생의 진입점이 된다(§1.1 — 매주 링크를 다시 뿌리지 않는다).
 */

interface PublicCourseLecture {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  order: number;
  is_expired: boolean;
}

interface PublicCourse {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  term: string | null;
  instructor_name: string | null;
  lecture_count: number;
  is_expired: boolean;
  /** 소유 교수자인가 — 미리보기에서 스튜디오 링크를 붙일지만 정한다. */
  is_owner?: boolean;
  lectures: PublicCourseLecture[];
}

type LoadState =
  | { kind: "loading" }
  | { kind: "ok"; data: PublicCourse }
  | { kind: "not-found" }
  // 제적(스펙 15 §4.2). 자동 복구하지 않으므로 조용히 실패시키지 않고 알린다.
  | { kind: "withdrawn" };

export default function CourseEntryContent() {
  const params = useParams<{ slug: string | string[] }>();
  const slug = Array.isArray(params?.slug) ? params.slug[0] : params?.slug;
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { t } = useI18n();

  const [state, setState] = useState<LoadState>(() =>
    slug ? { kind: "loading" } : { kind: "not-found" },
  );
  const [joining, setJoining] = useState(false);

  // 강좌 정보는 **로그인 전에도** 보여준다 — 학생이 무슨 강좌인지 보고 판단해야 한다.
  // 다만 인증 복원이 끝난 뒤에 부른다. 토큰이 붙기 전에 나가면 응답의 `is_owner` 가
  // 항상 false 로 와서 소유 교수자가 미리보기 도구를 못 본다.
  useEffect(() => {
    if (!slug || authLoading) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get<PublicCourse>(
          `/api/courses/public/${slug}`,
          { timeout: 10000 }, // 학생 진입 핫패스 — 멈춤이 빈 화면으로 굳지 않게 상한.
        );
        if (!cancelled) setState({ kind: "ok", data });
      } catch {
        if (!cancelled) setState({ kind: "not-found" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, authLoading]);

  // 학생이 아닌 로그인 사용자(교수자·운영자)는 **미리보기**다. 교수는 학기 초에 QR 을
  // 띄우기 전에 본인이 먼저 스캔해 보는데, 그때 화면이 깨지면 배포를 포기한다.
  // 소유 여부와 무관하다 — 남의 강좌를 열어도 등록은 안 되고 열람만 된다.
  const isPreview = !!user && user.role !== "student";

  // 등록은 slug 당 한 번만 — 이 이펙트는 state(객체)에 의존해서 강좌 조회가 다시
  // 돌면 함께 재실행된다. 서버에서 멱등이지만 같은 요청을 반복해 보낼 이유가 없다.
  const joinedSlugRef = useRef<string | null>(null);

  useEffect(() => {
    if (state.kind !== "ok" || authLoading) return;
    // 교수자에게는 호출하지 않는다 — join 은 require_student 라 403 이고,
    // 본인 강좌를 확인하러 들어온 교수자의 화면이 깨진다.
    if (user?.role !== "student" || !slug) return;
    if (joinedSlugRef.current === slug) return;
    joinedSlugRef.current = slug;

    let cancelled = false;
    (async () => {
      setJoining(true);
      try {
        await enrollmentApi.join({ course_slug: slug });
      } catch (err) {
        if (cancelled) return;
        if (axios.isAxiosError(err) && err.response?.status === 403) {
          setState({ kind: "withdrawn" });
          return;
        }
        // 그 외(네트워크 등)는 목록을 막지 않는다 — 게이트가 꺼진 배포 구간에서는
        // 등록 없이도 시청되고, 켜져 있으면 재생 시 서버가 다시 알려 준다.
      } finally {
        if (!cancelled) setJoining(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state, user, authLoading, slug]);

  const handleLogin = useCallback(() => {
    // 돌아올 주소를 먼저 보관한다. 이게 없으면 로그인 후 대시보드로 떨어져
    // **등록이 영영 호출되지 않는다** — 학기 초 QR 스캔이 정확히 이 경로다.
    if (slug) stashAuthNext(`/c/${slug}`);
    // 학생 가입 흐름은 건드리지 않는다(스펙 14 §0-2) — 기존 진입과 같은 함수.
    startGoogleLogin("student");
  }, [slug]);

  if (state.kind === "loading" || authLoading) {
    return (
      <StudentSurfaceLight bare>
        <div className="grid min-h-screen place-items-center text-sm text-text-muted">
          <p role="status">{t("student.courseEntry.loading")}</p>
        </div>
      </StudentSurfaceLight>
    );
  }

  if (state.kind === "not-found" || !slug) {
    return (
      <Notice
        title={t("student.courseEntry.notFoundTitle")}
        body={t("student.courseEntry.notFoundDesc")}
        onHome={() => router.push("/")}
        homeLabel={t("student.courseEntry.goHome")}
      />
    );
  }

  // 제적 — 재시도 버튼을 두지 않는다. 다시 눌러도 같은 403 이고, 되돌리는 건
  // 교수자만 할 수 있다(§4.2).
  if (state.kind === "withdrawn") {
    return (
      <Notice
        title={t("student.courseEntry.withdrawnTitle")}
        body={t("student.courseEntry.withdrawnDesc")}
      />
    );
  }

  const course = state.data;

  return (
    <StudentSurfaceLight>
      <div className="mx-auto w-full max-w-2xl px-4 py-10">
        <header className="animate-fade-in-up">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-subtle">
            {course.term && (
              <span className="rounded-full bg-gold/10 px-2 py-0.5 font-semibold tabular-nums text-gold-on-light">
                {course.term}
              </span>
            )}
            {course.instructor_name && <span>{course.instructor_name}</span>}
          </p>
          <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight text-text">
            {course.title}
          </h1>
          {course.description && (
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
              {course.description}
            </p>
          )}
        </header>

        {/* 미리보기 — 교수자가 QR 을 띄우기 전에 본인이 먼저 스캔한 경우. */}
        {isPreview && (
          <div
            role="status"
            data-testid="course-entry-preview-banner"
            className="animate-fade-in-up stagger-1 mt-6 rounded-2xl border border-gold-medium bg-gold/10 p-5"
          >
            <p className="text-sm font-bold text-gold-on-light">
              {t("student.courseEntry.previewTitle")}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-text-muted">
              {t("student.courseEntry.previewDesc")}
            </p>
          </div>
        )}

        {/* 비로그인 — 강좌는 이미 보여줬고, 시청하려면 로그인해야 한다. */}
        {!user && (
          <div className="animate-fade-in-up stagger-1 mt-6 rounded-2xl border border-line bg-bg-card p-5 shadow-sm">
            <p className="text-sm text-text-muted">
              {t("student.courseEntry.loginPrompt")}
            </p>
            <button
              type="button"
              onClick={handleLogin}
              className="mt-3 rounded-lg bg-gold-on-light px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gold-deep"
            >
              {t("student.courseEntry.loginCta")}
            </button>
            <p className="mt-2 text-xs text-text-faint">
              {t("student.courseEntry.loginNote")}
            </p>
          </div>
        )}

        {joining && (
          <p className="mt-4 text-xs text-text-subtle" role="status">
            {t("student.courseEntry.joining")}
          </p>
        )}

        {/* 강의 목록 — 등록 이후 매주 새 영상이 여기에 자동으로 나타난다. */}
        <section className="animate-fade-in-up stagger-2 mt-6">
          <h2 className="text-sm font-bold text-text-muted">
            {t("student.courseEntry.lecturesTitle")}
            {course.lecture_count > 0 && (
              <span className="ml-2 tabular-nums text-text-subtle">
                {course.lecture_count}
              </span>
            )}
          </h2>

          {course.lectures.length === 0 ? (
            <p className="mt-3 rounded-xl border border-line bg-bg-card px-4 py-6 text-center text-sm text-text-subtle">
              {t("student.courseEntry.noLectures")}
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {course.lectures.map((lec) => (
                <li key={lec.id}>
                  {isPreview ? (
                    // 미리보기에서는 학생 플레이어로 보내지 않는다 — 세션 시작이
                    // require_student 라 교수자는 곧바로 막히고, 확인하러 온 사람이
                    // 확인 대신 에러를 본다. 소유자에게만 스튜디오 링크를 준다.
                    <div className="rounded-xl border border-line bg-bg-card px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="min-w-0 text-sm font-medium text-text">
                          {lec.title}
                        </p>
                        {course.is_owner && (
                          <Link
                            href={`/professor/studio/${lec.id}`}
                            className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-text-muted transition hover:border-line-strong hover:bg-bg-hover"
                          >
                            {t("student.courseEntry.previewOpenStudio")}
                          </Link>
                        )}
                      </div>
                      {lec.is_expired && (
                        <p className="mt-0.5 text-xs text-text-faint">
                          {t("student.courseEntry.lectureExpired")}
                        </p>
                      )}
                    </div>
                  ) : lec.is_expired ? (
                    // 만료 강의는 목록에서 없애지 않는다 — 사라지면 학생이
                    // "내 강의가 없어졌다"고 문의한다. 열리지 않을 뿐이다.
                    <div className="rounded-xl border border-line bg-bg-subtle px-4 py-3 opacity-60">
                      <p className="text-sm font-medium text-text-muted">
                        {lec.title}
                      </p>
                      <p className="mt-0.5 text-xs text-text-faint">
                        {t("student.courseEntry.lectureExpired")}
                      </p>
                    </div>
                  ) : (
                    <Link
                      href={`/v/${lec.slug}`}
                      className="block rounded-xl border border-line bg-bg-card px-4 py-3 transition hover:border-line-strong hover:bg-bg-hover"
                    >
                      <p className="text-sm font-medium text-text">{lec.title}</p>
                      {lec.description && (
                        <p className="mt-0.5 truncate text-xs text-text-subtle">
                          {lec.description}
                        </p>
                      )}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 학생 제보 경로 — 학기 초 QR 로 등록한 학생은 이 주소가 학기 내내 홈이라
            `/dashboard` 를 한 번도 안 볼 수 있다. 시청 화면(플레이어)에는 두지
            않으므로 머무는 화면 두 곳에 같이 둔다(결정 2026-07-27).
            미리보기(교수자)에는 띄우지 않는다 — 학생에게 보이는 화면이 아니다. */}
        {!isPreview && user?.role === "student" && (
          <div className="mt-8">
            <FeedbackLauncher variant="card" />
          </div>
        )}
      </div>
    </StudentSurfaceLight>
  );
}

/** 안내 화면 — 찾을 수 없음 / 제적. 학생이 취할 행동을 문구가 담는다. */
function Notice({
  title,
  body,
  onHome,
  homeLabel,
}: {
  title: string;
  body: string;
  onHome?: () => void;
  homeLabel?: string;
}) {
  return (
    <StudentSurfaceLight>
      <div className="mx-auto max-w-md px-7 py-16 text-center">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-text">
          {title}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-text-muted">{body}</p>
        {onHome && homeLabel && (
          <button
            type="button"
            onClick={onHome}
            className="mt-6 rounded-xl bg-gold-on-light px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gold-deep"
          >
            {homeLabel}
          </button>
        )}
      </div>
    </StudentSurfaceLight>
  );
}
