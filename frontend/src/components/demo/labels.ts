"use client";

import type { HeroFlowStageLabels } from "./HeroFlowStage";
import type { TrustStripLabels } from "./TrustStrip";

/**
 * HeroFlowStage / TrustStrip 라벨 셋 빌더.
 *
 * `/demo` 는 `useDemoI18n` (demo.* prefix), `/` 는 `useLandingI18n`
 * (landingHub.* prefix) 가 호출한다. 두 도메인 모두 동일 키 형태 — 양쪽
 * patch JSON 에 같은 구조의 `flowStage.*` / `trustStrip.*` 가 있어야 한다.
 */
export function buildDemoHeroFlowLabels(
  t: (key: string) => string,
): HeroFlowStageLabels {
  return {
    topStatus: t("flowStage.topStatus"),
    topSub: t("flowStage.topSub"),
    step1: t("flowStage.step1"),
    step2: t("flowStage.step2"),
    step3: t("flowStage.step3"),
    aiTag1: t("flowStage.aiTag1"),
    aiTag2: t("flowStage.aiTag2"),
    aiTag3: t("flowStage.aiTag3"),
    chatSource: t("flowStage.chatSource"),
    bottomLead: t("flowStage.bottomLead"),
    bottomEmphasis: t("flowStage.bottomEmphasis"),
    bottomTail: t("flowStage.bottomTail"),
  };
}

export function buildDemoTrustStripLabels(
  t: (key: string) => string,
): TrustStripLabels {
  return {
    ariaLabel: t("trustStrip.dataLabel"),
    cells: [
      { label: t("trustStrip.dataLabel"), value: t("trustStrip.dataValue") },
      { label: t("trustStrip.ragLabel"), value: t("trustStrip.ragValue") },
      { label: t("trustStrip.inputLabel"), value: t("trustStrip.inputValue") },
      {
        label: t("trustStrip.sessionLabel"),
        value: t("trustStrip.sessionValue"),
      },
    ],
  };
}
