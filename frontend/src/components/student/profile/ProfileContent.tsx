"use client";

import { useEffect, useState } from "react";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useAuth } from "@/contexts/AuthContext";
import { A11yProvider } from "@/components/student/accessibility/A11yContext";
import AccessibilityPanel from "@/components/student/accessibility/AccessibilityPanel";
import CertificateList from "./CertificateList";
import CourseList from "./CourseList";
import EncouragementList from "./EncouragementList";
import Mascot from "./Mascot";
import PrivacyNotice from "./PrivacyNotice";
import StatsGrid from "./StatsGrid";
import StreakHeatmap from "./StreakHeatmap";
import { fetchProfileSnapshot } from "./fetchProfile";
import type { ProfileSnapshot, UserBasic } from "./types";
import { useProfileHubI18n } from "./useProfileHubI18n";

interface Props {
  /** 테스트에서 결정론적으로 데이터 주입. 미지정 시 fetchProfileSnapshot 호출. */
  initialSnapshot?: ProfileSnapshot;
  /** AuthContext mocking 이 어려운 케이스용 escape hatch. */
  fallbackUser?: UserBasic;
}

/**
 * /profile 본문.
 *
 * - **다크 모드 강제** (`#0A0A0A`) — colors.md §1, docs/planning/06-student-pages.md
 *   §1 ("학습자 화면은 다크 모드 강제")
 * - 마스코트 등장 — mascot.md §5.1 ("학습자 마이페이지 — 스트릭·인증서")
 * - AccessibilityPanel + A11yProvider 가 하단 좌측에 마운트되어 본 페이지에서도
 *   바로 자막·글씨·고대비·단축키 옵션 사용 가능.
 */
export default function ProfileContent({ initialSnapshot, fallbackUser }: Props) {
  const { user } = useAuth();
  const { t } = useProfileHubI18n();
  const [snapshot, setSnapshot] = useState<ProfileSnapshot | null>(
    initialSnapshot ?? null,
  );
  const [loading, setLoading] = useState(!initialSnapshot);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (initialSnapshot) return;
    let cancelled = false;
    (async () => {
      try {
        setError(false);
        const effectiveUser: UserBasic | null =
          (user as UserBasic | null) ??
          fallbackUser ??
          null;
        // user 가 null 이면 ProtectedRoute 가 막아주지만, 안전 가드.
        if (!effectiveUser) {
          setLoading(false);
          return;
        }
        const snap = await fetchProfileSnapshot(effectiveUser);
        if (!cancelled) setSnapshot(snap);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, fallbackUser, initialSnapshot]);

  if (loading) {
    return (
      <DarkShell>
        <LoadingSpinner fullScreen label={t("profileHub.loading")} />
      </DarkShell>
    );
  }

  if (!snapshot) {
    return (
      <DarkShell>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
          <div
            role="alert"
            className="rounded-2xl border border-red-400/30 bg-red-400/[0.04] p-5 text-sm text-red-200"
          >
            {t("profileHub.loadError")}
          </div>
        </div>
        <A11yProvider>
          <AccessibilityPanel />
        </A11yProvider>
      </DarkShell>
    );
  }

  const { user: u, streak, stats, inProgress, completed, certificates, encouragements, recentQuestions, mocked } = snapshot;
  const subtitle =
    u.school || u.department
      ? t("profileHub.headerSubtitle", {
          school: u.school ?? "",
          department: u.department ?? "",
        })
      : t("profileHub.headerSubtitleFallback");

  return (
    <DarkShell>
      <main
        data-testid="profile-page"
        data-mocked={mocked}
        className="max-w-5xl mx-auto px-4 sm:px-6 py-12 space-y-6"
      >
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-amber-400/30 bg-amber-400/[0.04] p-3 text-xs text-amber-200"
          >
            {t("profileHub.loadError")}
          </div>
        )}

        {/* 헤더 */}
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-amber-300">
              {t("profileHub.headerEyebrow")}
              {mocked && (
                <span
                  data-testid="profile-mock-badge"
                  className="ml-2 inline-flex items-center rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[9px] font-medium uppercase text-white/55 tracking-wider"
                >
                  {t("profileHub.previewBadge")}
                </span>
              )}
            </p>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mt-1">
              {u.name}
            </h1>
            <p className="text-sm text-white/55 mt-1">{subtitle}</p>
            {u.studentNumber && (
              <p className="text-xs text-white/40 mt-1 tabular-nums">
                {u.studentNumber}
              </p>
            )}
          </div>
          <Mascot expression="welcoming" size={88} className="shrink-0" />
        </header>

        <PrivacyNotice />

        <StreakHeatmap data={streak} />

        <StatsGrid stats={stats} />

        <CourseList inProgress={inProgress} completed={completed} />

        <CertificateList items={certificates} />

        <EncouragementList
          encouragements={encouragements}
          questions={recentQuestions}
        />
      </main>

      {/* 접근성 panel — provider 동봉 (자체 트리에서 동작) */}
      <A11yProvider>
        <AccessibilityPanel />
      </A11yProvider>
    </DarkShell>
  );
}

/**
 * 다크 base 강제 — 학습자 화면 정책. layout.tsx 의 `bg-gray-50` 을 본 페이지
 * 한정으로 덮어쓴다 (전역 layout 수정 없이).
 */
function DarkShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">{children}</div>
  );
}
