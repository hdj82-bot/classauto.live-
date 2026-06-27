"use client";

import { useRouter } from "next/navigation";
import OnboardingChecklist from "./OnboardingChecklist";
import { type OnboardingProgress, type OnboardingStepId } from "./onboardingSteps";
import { useProfessorI18n } from "./useProfessorI18n";

interface Props {
  /** 환영 메시지에 들어갈 교수자 이름 (없으면 익명형 카피) */
  professorName?: string;
  progress: OnboardingProgress;
  /** 라우팅 / 행동 트리거 */
  onCreateLecture: () => void;
}

/**
 * 빈 대시보드 (lectures.length === 0) 의 메인 화면.
 *
 * docs/planning/05-instructor-pages.md §3.1-3.3 (환영, Empty State, 체크리스트)
 * + §12 (교수자 화면 라이트 베이스 + 골드 포인트, 마스코트 미사용).
 *
 * 단계별 CTA 분기:
 *   - profile : 가입(OAuth) 시 학교·학과를 이미 입력하므로 항상 완료 상태 →
 *     체크리스트에 CTA 가 노출되지 않아 여기로 들어오지 않는다.
 *   - course / upload / script : `/professor/lecture/new` 로 이동
 *     (한 페이지에서 강좌 자동 생성 + 강의 생성 + PPT 업로드 + 스크립트 검토 진입)
 *   - share : 공개 처리는 강의 상세 화면 — 우선은 동일 라우트로 안내
 */
export default function EmptyDashboard({
  professorName,
  progress,
  onCreateLecture,
}: Props) {
  const { t } = useProfessorI18n();
  const router = useRouter();

  const handleStepAction = (_stepId: OnboardingStepId) => {
    onCreateLecture();
  };

  const handleAllComplete = () => {
    router.push("/professor/dashboard");
  };

  const welcomeTitle = professorName
    ? t("welcomeTitle", { name: professorName })
    : t("welcomeTitleAnonymous");

  return (
    <div
      data-testid="professor-empty-dashboard"
      className="space-y-6"
    >
      {/* Hero */}
      <section
        className="relative overflow-hidden rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50 via-white to-white p-6 sm:p-8"
        aria-labelledby="professor-welcome-heading"
      >
        <p className="text-[11px] tracking-[0.2em] uppercase text-amber-600 mb-2">
          {t("welcomeEyebrow")}
        </p>
        <h1
          id="professor-welcome-heading"
          className="text-2xl sm:text-3xl font-bold text-gray-900 leading-snug"
        >
          {welcomeTitle}
        </h1>
        <p className="mt-3 text-sm sm:text-base text-gray-600 max-w-2xl leading-relaxed">
          {t("welcomeSubtitle")}
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onCreateLecture}
            data-testid="professor-empty-primary-cta"
            className="inline-flex items-center justify-center rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-5 py-2.5 transition shadow-sm"
          >
            {t("primaryCta")}
          </button>
        </div>
      </section>

      {/* 두 칼럼 — 체크리스트(2/3) + 사이드 위젯(1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <OnboardingChecklist
            progress={progress}
            onStepAction={handleStepAction}
            onAllComplete={handleAllComplete}
          />
        </div>

        <aside className="space-y-5" aria-label={t("snapshotTitle")}>
          {/* 학기 스냅샷 (placeholder) — 실 데이터는 강좌·강의 생성 후 채워짐 */}
          <section className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              {t("snapshotTitle")}
            </h3>
            <dl className="grid grid-cols-3 gap-2 text-center">
              <SnapshotStat label={t("snapshotCourses")} value="—" />
              <SnapshotStat label={t("snapshotLectures")} value="—" />
              <SnapshotStat label={t("snapshotPublished")} value="—" />
            </dl>
          </section>

          {/* 도움말 카드 */}
          <section className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">
              {t("tips")}
            </h3>
            <ul className="space-y-2.5 text-sm text-gray-600 leading-relaxed">
              <li className="pl-2 border-l-2 border-amber-300/70">
                {t("tipDraftFirst")}
              </li>
              <li className="pl-2 border-l-2 border-amber-300/70">
                {t("tipQrFromPpt")}
              </li>
              <li className="pl-2 border-l-2 border-amber-300/70">
                {t("tipPolicy")}
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

function SnapshotStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 py-3">
      <p className="text-xl font-semibold text-gray-900 tabular-nums leading-none">
        {value}
      </p>
      <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-gray-400">
        {label}
      </p>
    </div>
  );
}
