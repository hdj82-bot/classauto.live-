/**
 * 교수자 첫 사용 온보딩의 5단계 정의 + 진행도 산출.
 *
 * 기획 근거: docs/planning/05-instructor-pages.md §3.3 (5단계 가이드 체크리스트).
 *
 * 별도 백엔드 컬럼을 추가하지 않고, 기존 `User` / `Course` / `Lecture` 모델의
 * 필드만으로 단계 완료 여부를 추론합니다. 이 추론은 부수효과가 없는
 * 순수 함수 (`computeOnboardingProgress`) 로 두고 화면 곳곳에서 재사용합니다.
 */

export type OnboardingStepId =
  | "profile"
  | "course"
  | "upload"
  | "script"
  | "share";

export interface OnboardingStepDef {
  id: OnboardingStepId;
  /** i18n 키 (`professorOnboarding.stepProfile.title` 같이 풀어질 prefix) */
  i18nKeyPrefix: string;
  /** 가벼운 emoji — design-system 의 그라데이션 SVG 정책은 후속 작업에서 적용 */
  glyph: string;
}

export const ONBOARDING_STEPS: ReadonlyArray<OnboardingStepDef> = [
  { id: "profile", i18nKeyPrefix: "stepProfile", glyph: "🪪" },
  { id: "course", i18nKeyPrefix: "stepCourse", glyph: "📚" },
  { id: "upload", i18nKeyPrefix: "stepUpload", glyph: "📤" },
  { id: "script", i18nKeyPrefix: "stepScript", glyph: "📝" },
  { id: "share", i18nKeyPrefix: "stepShare", glyph: "🔗" },
];

/**
 * 단계별 완료 여부 추론 입력. 각 필드는 백엔드 응답이 부분적으로만 도착해도
 * 안전하도록 모두 optional / nullable 으로 받습니다.
 */
export interface OnboardingSignals {
  /** 학과·소속 입력 모달을 통해 제출 또는 user.school 이 채워진 상태 */
  profileSaved: boolean;
  /** 강좌(course) 가 1개 이상 존재 — `/api/courses` 응답 */
  courseCount: number;
  /** 강의(lecture) 가 1개 이상 존재 — PPT 업로드 후 lecture row 생성 */
  lectureCount: number;
  /** 영상 합성 파이프라인이 시작된 강의가 1개 이상 — 스크립트 승인 = 렌더 시작 */
  lectureWithRenderCount: number;
  /** 학생 공유 가능한 (is_published=true) 강의가 1개 이상 */
  publishedLectureCount: number;
}

export interface OnboardingProgress {
  /** 각 단계의 완료 여부 (id 순) */
  done: Record<OnboardingStepId, boolean>;
  /** 다음으로 안내할 단계 (없으면 null = 모든 단계 완료) */
  nextStep: OnboardingStepId | null;
  /** 완료한 단계 수 */
  doneCount: number;
  /** 전체 단계 수 */
  totalCount: number;
}

/**
 * Pure function — 동일 input 으로 동일 output. 테스트 용이성을 위해 순수 유지.
 *
 * 단계는 정의 순서대로 평가하며, 첫 미완료 단계가 `nextStep`. 모두 완료된
 * 사용자는 `nextStep === null`.
 */
export function computeOnboardingProgress(
  signals: OnboardingSignals,
): OnboardingProgress {
  const done: Record<OnboardingStepId, boolean> = {
    profile: signals.profileSaved,
    course: signals.courseCount > 0,
    upload: signals.lectureCount > 0,
    script: signals.lectureWithRenderCount > 0,
    share: signals.publishedLectureCount > 0,
  };

  let nextStep: OnboardingStepId | null = null;
  for (const def of ONBOARDING_STEPS) {
    if (!done[def.id]) {
      nextStep = def.id;
      break;
    }
  }

  const doneCount = Object.values(done).filter(Boolean).length;

  return {
    done,
    nextStep,
    doneCount,
    totalCount: ONBOARDING_STEPS.length,
  };
}
