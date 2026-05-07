"use client";

import { useState } from "react";
import { useStudioI18n } from "./useStudioI18n";

interface ShareLinksProps {
  url: string;
  classCode: string | null;
  lectureTitle: string;
}

/**
 * 공유 채널 5종 — 이메일 / 카톡 / X / URL 복사 / QR.
 *
 * QR 다운로드는 외부 의존성 (qrcode 등) 또는 백엔드 PNG 생성 endpoint 가
 * 필요하다 — 본 PR 에선 "곧 지원됩니다" 안내. BACKEND_ASKS.STUDIO §3 참조.
 *
 * 카톡 공유는 SDK 도입 없이 단순 link 로 한정. 카톡 SDK 도입 시
 * `Kakao.Share.sendDefault` 로 교체.
 */
export default function ShareLinks({
  url,
  classCode,
  lectureTitle,
}: ShareLinksProps) {
  const { t } = useStudioI18n();
  const [copied, setCopied] = useState<"url" | "code" | null>(null);

  const copy = async (text: string, kind: "url" | "code") => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      // 클립보드 실패는 조용히 무시 — 사용자는 link 를 직접 selectAll 가능.
    }
  };

  const encoded = encodeURIComponent(url);
  const titleEncoded = encodeURIComponent(lectureTitle);

  return (
    <div className="space-y-5">
      {/* 강의 링크 */}
      <div>
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
          {t("step5.linkLabel")}
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 outline-none font-mono"
          />
          <button
            type="button"
            onClick={() => copy(url, "url")}
            className="text-xs bg-gray-900 text-white rounded-xl px-3 py-2 hover:bg-gray-800 transition tabular-nums"
          >
            {copied === "url" ? t("step5.linkCopied") : t("step5.linkCopy")}
          </button>
        </div>
      </div>

      {/* 학습 코드 */}
      {classCode && (
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
            {t("step5.codeLabel")}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={classCode}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-sm font-bold text-amber-800 outline-none font-mono tracking-widest"
            />
            <button
              type="button"
              onClick={() => copy(classCode, "code")}
              className="text-xs bg-gray-900 text-white rounded-xl px-3 py-2 hover:bg-gray-800 transition"
            >
              {copied === "code" ? t("step5.linkCopied") : t("step5.linkCopy")}
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-1">
            {t("step5.codeHelp")}
          </p>
        </div>
      )}

      {/* 공유 채널 5종 */}
      <div>
        <h4 className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
          {t("step5.shareSection")}
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <a
            href={`mailto:?subject=${titleEncoded}&body=${encoded}`}
            className="text-xs text-center border border-gray-200 hover:border-gray-300 rounded-xl px-3 py-2.5 transition"
          >
            {t("step5.shareEmail")}
          </a>
          <a
            href={`https://sharer.kakao.com/talk/friends/picker/link?url=${encoded}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-center border border-gray-200 hover:border-gray-300 rounded-xl px-3 py-2.5 transition"
          >
            {t("step5.shareKakao")}
          </a>
          <a
            href={`https://twitter.com/intent/tweet?text=${titleEncoded}&url=${encoded}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-center border border-gray-200 hover:border-gray-300 rounded-xl px-3 py-2.5 transition"
          >
            {t("step5.shareX")}
          </a>
          <button
            type="button"
            onClick={() => copy(url, "url")}
            className="text-xs text-center border border-gray-200 hover:border-gray-300 rounded-xl px-3 py-2.5 transition"
          >
            {t("step5.shareUrl")}
          </button>
          <button
            type="button"
            disabled
            title={t("step5.qrPending")}
            className="text-xs text-center border border-gray-200 rounded-xl px-3 py-2.5 text-gray-300 cursor-not-allowed"
          >
            {t("step5.shareQr")}
          </button>
        </div>
        <p className="text-[11px] text-gray-400 mt-2">{t("step5.qrPending")}</p>
      </div>
    </div>
  );
}
