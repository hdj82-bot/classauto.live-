import { describe, it, expect } from "vitest";
import {
  computeOnboardingProgress,
  ONBOARDING_STEPS,
  type OnboardingSignals,
} from "@/components/professor/onboardingSteps";

const empty: OnboardingSignals = {
  profileSaved: false,
  courseCount: 0,
  lectureCount: 0,
  lectureWithRenderCount: 0,
  publishedLectureCount: 0,
};

describe("computeOnboardingProgress", () => {
  it("treats a brand-new professor as 0/5 done with profile as the next step", () => {
    const p = computeOnboardingProgress(empty);
    expect(p.doneCount).toBe(0);
    expect(p.totalCount).toBe(5);
    expect(p.nextStep).toBe("profile");
    expect(Object.values(p.done).every((v) => v === false)).toBe(true);
  });

  it("advances nextStep through the canonical 5-step order", () => {
    const stages: Array<[Partial<OnboardingSignals>, string | null]> = [
      [{ profileSaved: true }, "course"],
      [{ profileSaved: true, courseCount: 1 }, "upload"],
      [{ profileSaved: true, courseCount: 1, lectureCount: 1 }, "script"],
      [
        {
          profileSaved: true,
          courseCount: 1,
          lectureCount: 1,
          lectureWithRenderCount: 1,
        },
        "share",
      ],
      [
        {
          profileSaved: true,
          courseCount: 1,
          lectureCount: 1,
          lectureWithRenderCount: 1,
          publishedLectureCount: 1,
        },
        null,
      ],
    ];
    for (const [partial, expected] of stages) {
      const p = computeOnboardingProgress({ ...empty, ...partial });
      expect(p.nextStep).toBe(expected);
    }
  });

  it("cascades 'done' bits without skipping when later steps light up early", () => {
    // 학생이 영상까지 만들고 공개도 했는데 프로필을 안 채운 엣지 케이스 — 프로필이
    // 여전히 nextStep 이지만 나머지 done 비트는 정직하게 켠다.
    const p = computeOnboardingProgress({
      profileSaved: false,
      courseCount: 1,
      lectureCount: 1,
      lectureWithRenderCount: 1,
      publishedLectureCount: 1,
    });
    expect(p.nextStep).toBe("profile");
    expect(p.done.course).toBe(true);
    expect(p.done.upload).toBe(true);
    expect(p.done.script).toBe(true);
    expect(p.done.share).toBe(true);
    expect(p.doneCount).toBe(4);
  });

  it("ships exactly 5 canonical steps in the documented order", () => {
    expect(ONBOARDING_STEPS.map((s) => s.id)).toEqual([
      "profile",
      "course",
      "upload",
      "script",
      "share",
    ]);
  });
});
