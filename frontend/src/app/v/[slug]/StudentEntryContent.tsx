"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import axios from "axios";
import { api, enrollmentApi } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import StudentSurfaceLight from "@/components/student/v2/StudentSurfaceLight";
import EntryCard from "@/components/student/v2/EntryCard";

/**
 * /v/[slug] — 학생 측 진입 페이지 (v2).
 *
 * v1 과의 차이:
 * - 라이트 톤(`#FAFAF7` 베이스) 으로 전환 (colors.md §1, 06 prototype 출처).
 * - 헤더·sender·course·reqs·actions·tut·foot 카드를 80/160/240/320/400/480ms
 *   stagger fade-in 으로 등장.
 * - 학생으로 로그인된 사용자는 본 페이지를 거치지 않고 곧장 /lecture/[slug]
 *   (다크 톤 영상 시청) 로 자동 이동 — 비영상 라이트 → 영상 다크 흐름.
 *
 * 데이터: 백엔드 GET /api/lectures/{slug}/public.
 * Mock fallback: 개발 환경(dev) 에서 backend down 시 시연 데이터로 렌더.
 */
interface PublicLecture {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  slug: string;
  is_expired: boolean;
  video_url: string | null;
  // ↓ Window 1/3 의 백엔드 PR 이 머지되면 자동으로 채워진다. 현재는 optional.
  professor_name?: string | null;
  course_name?: string | null;
  school_name?: string | null;
  duration_sec?: number | null;
  week_number?: number | null;
  lesson_number?: number | null;
  watching_count?: number | null;
  avg_accuracy?: number | null;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "ok"; data: PublicLecture; mocked: boolean }
  | { kind: "not-found" }
  // 제적된 학생(스펙 15 §4.2). 자동 복구하지 않으므로 조용히 실패시키지 않고
  // 무슨 일이 일어났는지·누구에게 문의할지 알려 준다.
  | { kind: "withdrawn" };

// 06 prototype 의 시연 데이터(把자문 · 중국어문법의 이해 3주차)를 dev mock 으로
// 그대로 활용. 실 서비스에서는 backend 가 데이터를 채워 보낸다.
const mockLecture = (slug: string): PublicLecture => ({
  id: "mock-id",
  course_id: "mock-course-id",
  title: "把자문 (把字句) 입문",
  description:
    "把字句 의 기본 어순과 처치문(處置文)이 강조하는 의미를 정리합니다.",
  thumbnail_url: null,
  slug,
  is_expired: false,
  video_url: null,
  professor_name: "하두진",
  course_name: "중국어문법의 이해",
  school_name: "경기대학교",
  duration_sec: 312,
  week_number: 3,
  lesson_number: 7,
  watching_count: 23,
  avg_accuracy: 82,
});

export default function StudentEntryContent() {
  const params = useParams<{ slug: string | string[] }>();
  const slug = Array.isArray(params?.slug) ? params.slug[0] : params?.slug;
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { t } = useI18n();

  const [state, setState] = useState<LoadState>(() =>
    slug ? { kind: "loading" } : { kind: "not-found" },
  );

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      try {
        // slug 는 useParams 가 주는 그대로 사용한다(이미 URL-인코딩된 세그먼트).
        // encodeURIComponent 로 다시 감싸면 한글 slug 가 이중 인코딩돼(%EC→%25EC)
        // 백엔드 정확일치 조회가 실패→404→"강의를 찾을 수 없습니다"가 됐다.
        // 형제 경로(PlayerV2·assess)도 raw 통과 규약을 쓴다.
        const { data } = await api.get<PublicLecture>(
          `/api/lectures/${slug}/public`,
          { timeout: 10000 }, // 학생 진입 핫패스 — 멈춤이 빈 화면으로 굳지 않게 상한.
        );
        if (cancelled) return;
        if (data.is_expired) {
          router.replace("/expired");
          return;
        }
        setState({ kind: "ok", data, mocked: false });
      } catch (err) {
        if (cancelled) return;
        if (axios.isAxiosError(err) && err.response?.status === 404) {
          setState({ kind: "not-found" });
          return;
        }
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

  // 학생으로 이미 로그인된 사용자는 진입 카드 대신 곧장 /lecture/[slug] 로
  // 보낸다 — 본 페이지의 라이트 톤은 "비로그인 첫 인상" 전용.
  //
  // 넘기기 **전에** 수강 등록을 만든다(스펙 15 §4.1). 등록은 강의가 아니라 그 강의가
  // 속한 **강좌 단위**라, 매주 새 영상마다 다시 등록할 필요가 없다 — 학기 초 한 번이면
  // 이후 발행되는 영상은 자동으로 열린다.
  //
  // 교수자(role=professor)에게는 호출하지 않는다. join 은 require_student 라 403 이
  // 나고, 교수자의 본인 강의 미리보기 경로가 깨진다.
  // 이 이펙트는 `state`(객체)에 의존해서, 강의 조회가 다시 돌아 새 state 가 잡히면
  // 함께 재실행된다. join 은 서버에서 멱등이라 위험하진 않지만 같은 요청을 수십 번
  // 보내게 되므로, slug 당 한 번만 나가도록 ref 로 잠근다.
  const joinedSlugRef = useRef<string | null>(null);

  useEffect(() => {
    if (state.kind !== "ok" || authLoading) return;
    if (user?.role !== "student" || !slug) return;
    if (joinedSlugRef.current === slug) return;
    joinedSlugRef.current = slug;

    let cancelled = false;
    (async () => {
      try {
        // 멱등 — 이미 등록돼 있으면 같은 등록이 그대로 돌아온다(재진입·새로고침 안전).
        await enrollmentApi.join({ lecture_slug: slug });
      } catch (err) {
        if (cancelled) return;
        // 제적은 조용히 넘기지 않는다. 그냥 재생 화면으로 보내면 학생은 영상이
        // 안 나오는 이유를 알 수 없다.
        if (axios.isAxiosError(err) && err.response?.status === 403) {
          setState({ kind: "withdrawn" });
          return;
        }
        // 그 외 오류(네트워크 등)는 재생을 막지 않는다 — 게이트가 꺼진 배포 구간에서는
        // 등록 없이도 시청이 되고, 켜진 뒤라면 서버가 403 으로 다시 알려 준다.
      }
      if (!cancelled) router.replace(`/lecture/${slug}`);
    })();
    return () => {
      cancelled = true;
    };
  }, [state, user, authLoading, slug, router]);

  // Loading 상태 — 라이트 톤에 맞춰 작게 표시 (영상 없음 = 라이트).
  if (state.kind === "loading" || authLoading) {
    return (
      <StudentSurfaceLight bare>
        <div
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            color: "rgba(10, 10, 10, 0.55)",
            fontSize: "14px",
          }}
        >
          <p role="status">{t("student.entry.loadingLecture")}</p>
        </div>
      </StudentSurfaceLight>
    );
  }

  // 제적 안내 — 학생이 취할 행동("교수님께 문의")을 분명히 한다. 재시도 버튼은
  // 두지 않는다. 다시 눌러도 같은 403 이고, 되돌리는 건 교수자만 할 수 있다.
  if (state.kind === "withdrawn") {
    return (
      <StudentSurfaceLight>
        <div
          style={{
            maxWidth: 460,
            margin: "60px auto",
            textAlign: "center",
            padding: "60px 28px",
            color: "rgba(10, 10, 10, 0.62)",
          }}
        >
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: 28,
              color: "var(--text-light)",
              marginBottom: 12,
            }}
          >
            {t("student.entry.withdrawnTitle")}
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.6 }}>
            {t("student.entry.withdrawnDesc")}
          </p>
        </div>
      </StudentSurfaceLight>
    );
  }

  if (state.kind === "not-found" || !slug) {
    return (
      <StudentSurfaceLight>
        <div
          style={{
            maxWidth: 460,
            margin: "60px auto",
            textAlign: "center",
            padding: "60px 28px",
            color: "rgba(10, 10, 10, 0.62)",
          }}
        >
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: 28,
              color: "var(--text-light)",
              marginBottom: 12,
            }}
          >
            {t("student.entry.lectureNotFoundTitle")}
          </h1>
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              marginBottom: 28,
            }}
          >
            {t("student.entry.lectureNotFoundDesc")}
          </p>
          <button
            type="button"
            onClick={() => router.push("/")}
            style={{
              background: "var(--gold)",
              color: "#0A0A0A",
              padding: "10px 22px",
              borderRadius: 12,
              border: "none",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            {t("student.entry.backToHome")}
          </button>
        </div>
      </StudentSurfaceLight>
    );
  }

  // state.kind === "ok"
  const d = state.data;
  return (
    <StudentSurfaceLight>
      <EntryCard
        slug={slug}
        title={d.title}
        description={d.description}
        professorName={d.professor_name ?? null}
        courseName={d.course_name ?? null}
        schoolName={d.school_name ?? null}
        durationSec={d.duration_sec ?? null}
        weekNumber={d.week_number ?? null}
        lessonNumber={d.lesson_number ?? null}
        watchingCount={d.watching_count ?? null}
        avgAccuracy={d.avg_accuracy ?? null}
        signupHref={`/auth/signup?next=${encodeURIComponent(`/v/${slug}`)}`}
        mocked={state.mocked}
      />
    </StudentSurfaceLight>
  );
}
