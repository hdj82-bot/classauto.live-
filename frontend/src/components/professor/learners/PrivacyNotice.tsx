"use client";

import { useLearnersI18n } from "./useLearnersI18n";

/**
 * 학생 데이터 보호 정책 안내 배너.
 *
 * docs/planning/02-guardrails.md "학생 데이터 보호" + CLAUDE.md "핵심 차별점
 * 4가지 — ④ 학생 데이터 보호 (광고 미사용, 졸업 후 자동 삭제)" 정책의
 * 가시화. 학습자 관리 페이지마다 상단 또는 하단에 1회 노출해 교수자가
 * 본인의 데이터 책임을 인지하게 한다.
 *
 * 의도적으로 "광고/외부 공유" UI 자체를 만들지 않는다 — 광고 토글 버튼이
 * 보이는 순간 정책의 신뢰가 깨진다.
 */
export default function PrivacyNotice() {
  const { t } = useLearnersI18n();
  return (
    <aside
      data-testid="learners-privacy-notice"
      className="rounded-xl border border-gray-200 bg-gray-50 p-4 sm:p-5"
      aria-labelledby="learners-privacy-heading"
    >
      <div className="flex items-start gap-3">
        <div
          aria-hidden="true"
          className="shrink-0 mt-0.5 w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center"
        >
          <svg
            className="w-4 h-4 text-emerald-700"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <div className="min-w-0">
          <h3
            id="learners-privacy-heading"
            className="text-sm font-semibold text-gray-900"
          >
            {t("privacyHeading")}
          </h3>
          <ul className="mt-1.5 space-y-1 text-xs text-gray-600 leading-relaxed list-disc pl-4">
            <li>{t("privacyBullet1")}</li>
            <li>{t("privacyBullet2")}</li>
            <li>{t("privacyBullet3")}</li>
          </ul>
          <a
            href={t("privacyMoreHref")}
            className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-indigo-600 hover:text-indigo-700"
          >
            {t("privacyMoreLink")} →
          </a>
        </div>
      </div>
    </aside>
  );
}
