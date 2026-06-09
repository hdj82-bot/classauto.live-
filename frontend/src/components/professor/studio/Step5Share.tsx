"use client";

import Link from "next/link";
import { useState } from "react";
import { useStudioI18n } from "./useStudioI18n";
import ShareLinks from "./ShareLinks";
import { formatDuration } from "./costEstimator";
import type { Lecture } from "./studioTypes";

interface Step5Props {
  lecture: Lecture;
  durationSeconds: number;
  // /v/[slug] 학생 진입 URL 의 origin (도메인). SSR 시점엔 빈 문자열일 수 있어 호출자가 책임.
  origin: string;
  onPublishToggle: (publish: boolean) => Promise<void>;
  publishing: boolean;
  // 학습 코드 — 백엔드 R2W2 BACKEND_ASKS §4 의 redeem-code 엔드포인트 도착 후 채워짐.
  // 미구현 시 null — UI 가 자동으로 코드 영역을 숨김.
  classCode: string | null;
}

/**
 * Step 5 — 공유 + 게시.
 *
 * docs/planning/05-instructor-pages.md §5.4 영상 완성 후 공유 패널 + §5.5 QR.
 *
 * publish 토글이 OFF 인 동안 학생은 링크가 있어도 영상을 볼 수 없다 (백엔드
 * `is_published` 검사). 토글을 켜야 게시 완료.
 */
export default function Step5Share({
  lecture,
  durationSeconds,
  origin,
  onPublishToggle,
  publishing,
  classCode,
}: Step5Props) {
  const { t } = useStudioI18n();

  const [passwordProtect, setPasswordProtect] = useState(false);
  const [schoolEmailOnly, setSchoolEmailOnly] = useState(true);
  const [expirePeriod, setExpirePeriod] = useState(false);

  const lectureUrl = `${origin}/v/${lecture.slug}`;

  return (
    <section
      aria-labelledby="step5-title"
      className="space-y-6"
    >
      <header className="text-center bg-gradient-to-br from-indigo-50 to-amber-50 border border-amber-100 rounded-2xl p-8">
        <h2
          id="step5-title"
          className="text-2xl font-bold text-gray-900"
          style={{ fontFamily: "'Paperlogy', 'Pretendard Variable', sans-serif" }}
        >
          {t("step5.title")}
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          {t("step5.subtitle", { lectureTitle: lecture.title })}
        </p>
        {durationSeconds > 0 && (
          <p className="mt-1 text-xs text-gray-500 tabular-nums">
            {t("step5.duration", { duration: formatDuration(durationSeconds) })}
          </p>
        )}
      </header>

      {/* 공개 상태 배너 — 비공개면 링크가 항상 404 이므로 절대 놓치지 않게 크게 경고하고
          한 번에 공개할 수 있게 한다(자동 공개는 하지 않음 — 교수자 명시 결정). */}
      {lecture.is_published ? (
        <div
          role="status"
          className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl p-5"
        >
          <span aria-hidden="true" className="mt-0.5 text-emerald-600">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M8 12.5l2.5 2.5L16 9" />
            </svg>
          </span>
          <div>
            <p className="text-sm font-semibold text-emerald-900">
              {t("step5.publishedBannerTitle")}
            </p>
            <p className="text-xs text-emerald-700 mt-0.5">
              {t("step5.publishedBannerBody")}
            </p>
          </div>
        </div>
      ) : (
        <div
          role="alert"
          className="flex items-start gap-3 bg-amber-50 border border-amber-300 rounded-2xl p-5"
        >
          <span aria-hidden="true" className="mt-0.5 text-amber-600">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
              <path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
            </svg>
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900">
              {t("step5.privacyWarnTitle")}
            </p>
            <p className="text-xs text-amber-800 mt-0.5">
              {t("step5.privacyWarnBody")}
            </p>
            <button
              type="button"
              onClick={() => onPublishToggle(true)}
              disabled={publishing}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-white rounded-xl px-4 py-2 transition disabled:opacity-50"
            >
              {publishing ? t("step5.publishNowBusy") : t("step5.publishNow")}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <ShareLinks
          url={lectureUrl}
          classCode={classCode}
          lectureTitle={lecture.title}
        />
      </div>

      {/* 공유 설정 */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">
          {t("step5.settingsSection")}
        </h3>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={passwordProtect}
            onChange={(e) => setPasswordProtect(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-sm text-gray-700">
            {t("step5.passwordProtect")}
          </span>
        </label>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={schoolEmailOnly}
            onChange={(e) => setSchoolEmailOnly(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-sm text-gray-700">
            {t("step5.schoolEmailOnly")}
          </span>
        </label>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={expirePeriod}
            onChange={(e) => setExpirePeriod(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-sm text-gray-700">
            {t("step5.expirePeriod")}
          </span>
        </label>
      </div>

      {/* Publish 토글 */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-gray-900">
            {t("step5.publishToggle")}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {lecture.is_published
              ? t("step5.publishedNotice")
              : t("step5.unpublishedNotice")}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={lecture.is_published}
          onClick={() => onPublishToggle(!lecture.is_published)}
          disabled={publishing}
          className={`relative inline-flex w-12 h-7 rounded-full transition disabled:opacity-50 ${
            lecture.is_published ? "bg-emerald-500" : "bg-gray-300"
          }`}
        >
          <span
            aria-hidden="true"
            className={`absolute top-0.5 w-6 h-6 rounded-full bg-white transition-transform ${
              lecture.is_published ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:justify-between">
        <Link
          href={`/v/${lecture.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm border border-gray-300 rounded-xl px-4 py-2.5 hover:bg-gray-50 transition text-center"
        >
          {t("step5.viewLecture")}
        </Link>
        <Link
          href="/professor/dashboard"
          className="text-sm bg-gray-900 hover:bg-gray-800 text-white rounded-xl px-4 py-2.5 transition text-center"
        >
          {t("step5.backToDashboard")}
        </Link>
      </div>
    </section>
  );
}
