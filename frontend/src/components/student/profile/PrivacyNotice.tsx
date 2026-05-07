"use client";

import Link from "next/link";
import { useProfileHubI18n } from "./useProfileHubI18n";

/**
 * 학생용 PrivacyNotice — 본인 데이터 관점.
 *
 * 학습자 마이페이지가 학생의 개인 학습 흔적을 한 곳에 모으므로, "이 데이터가
 * 어디로 가는가"를 학생 본인이 명확히 인지할 수 있도록 매 화면 1회 노출.
 *
 * 의도적으로 외부 공유 / 광고 / 마케팅 관련 UI 슬롯을 만들지 않는다 — 회귀
 * lint (PrivacyLintTest) 가 페이지 내 a/button 라벨에서 forbidden 키워드를
 * 차단한다.
 */
export default function PrivacyNotice() {
  const { t } = useProfileHubI18n();
  return (
    <aside
      data-testid="profile-privacy-notice"
      aria-labelledby="profile-privacy-heading"
      className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <div
          aria-hidden="true"
          className="shrink-0 mt-0.5 w-7 h-7 rounded-full bg-emerald-400/15 flex items-center justify-center"
        >
          <svg
            className="w-4 h-4 text-emerald-300"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            aria-hidden="true"
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
            id="profile-privacy-heading"
            className="text-sm font-semibold text-white"
          >
            {t("profileHub.privacy.heading")}
          </h3>
          <ul className="mt-1.5 space-y-1 text-xs text-white/70 leading-relaxed list-disc pl-4">
            <li>{t("profileHub.privacy.bullet1")}</li>
            <li>{t("profileHub.privacy.bullet2")}</li>
            <li>{t("profileHub.privacy.bullet3")}</li>
          </ul>
          <Link
            href={t("profileHub.privacy.moreHref")}
            className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-amber-300 hover:text-amber-200"
          >
            {t("profileHub.privacy.moreLink")} →
          </Link>
        </div>
      </div>
    </aside>
  );
}
