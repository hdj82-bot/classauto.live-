"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useStudioI18n } from "./useStudioI18n";

interface ShareLinksProps {
  url: string;
  classCode: string | null;
  lectureTitle: string;
}

/**
 * 공유 채널 + QR 코드.
 *
 * - 채널 4종: 이메일 / 카톡 / X / URL 복사.
 * - QR: 학생 링크를 QR 로 렌더(qrcode → PNG dataURL), PNG 다운로드 + 공유
 *   (Web Share API, 파일 공유 미지원 환경은 링크 공유/복사로 폴백).
 *
 * 카톡 공유는 SDK 도입 없이 단순 link 로 한정.
 */
export default function ShareLinks({
  url,
  classCode,
  lectureTitle,
}: ShareLinksProps) {
  const { t } = useStudioI18n();
  const [copied, setCopied] = useState<"url" | "code" | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  // QR 다운로드/공유는 브라우저가 조용히 처리(다운로드 폴더 저장·클립보드 복사)해
  // "아무 반응 없음"처럼 보였다. 클릭 직후 짧게 ✓ 피드백을 띄워 동작을 알린다.
  const [qrMsg, setQrMsg] = useState<"downloaded" | "shared" | null>(null);
  const flashQr = (m: "downloaded" | "shared") => {
    setQrMsg(m);
    setTimeout(() => setQrMsg(null), 1800);
  };

  // 학생 링크 → QR PNG dataURL. url 이 바뀌면 재생성.
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { width: 480, margin: 2, errorCorrectionLevel: "M" })
      .then((d) => {
        if (!cancelled) setQrDataUrl(d);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

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

  const qrFileName = `${(lectureTitle || "lecture").replace(/[\\/:*?"<>|]+/g, "_")}-QR.png`;

  const downloadQr = () => {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = qrFileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    flashQr("downloaded");
  };

  const shareQr = async () => {
    if (typeof navigator === "undefined") return;
    // 1순위: QR 이미지 파일을 직접 공유(모바일 카톡/메시지 등).
    try {
      if (qrDataUrl && typeof fetch !== "undefined") {
        const blob = await (await fetch(qrDataUrl)).blob();
        const file = new File([blob], qrFileName, { type: "image/png" });
        const navAny = navigator as Navigator & {
          canShare?: (data?: ShareData) => boolean;
        };
        if (navAny.canShare?.({ files: [file] }) && navigator.share) {
          await navigator.share({ files: [file], title: lectureTitle, text: url });
          flashQr("shared");
          return;
        }
      }
      // 2순위: 링크만 공유.
      if (navigator.share) {
        await navigator.share({ title: lectureTitle, text: lectureTitle, url });
        flashQr("shared");
        return;
      }
    } catch {
      // 사용자가 공유 취소했거나 미지원 — 링크 복사로 폴백.
    }
    // 3순위(데스크톱 등 Web Share 미지원): 링크 복사 + ✓ 피드백.
    await copy(url, "url");
    flashQr("shared");
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
          <p className="text-[11px] text-gray-400 mt-1">{t("step5.codeHelp")}</p>
        </div>
      )}

      {/* QR 코드 — 학생 링크. 다운로드/공유 가능. */}
      <div>
        <h4 className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
          {t("step5.qrLabel")}
        </h4>
        <div className="flex items-center gap-4">
          {qrDataUrl ? (
            // 학생 링크 QR (PNG dataURL) — 클릭하면 바로 다운로드(이미지 클릭도 동작).
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrDataUrl}
              alt={t("step5.qrLabel")}
              width={120}
              height={120}
              onClick={downloadQr}
              title={t("step5.qrDownload")}
              className="rounded-lg border border-gray-200 bg-white p-2 cursor-pointer hover:border-gray-400 transition"
            />
          ) : (
            <div className="w-[120px] h-[120px] rounded-lg border border-gray-200 bg-gray-50 animate-pulse" />
          )}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={downloadQr}
              disabled={!qrDataUrl}
              className="text-xs text-center bg-gray-900 text-white rounded-xl px-4 py-2.5 hover:bg-gray-800 transition disabled:opacity-50"
            >
              {qrMsg === "downloaded" ? `✓ ${t("step5.qrDownload")}` : t("step5.qrDownload")}
            </button>
            <button
              type="button"
              onClick={shareQr}
              disabled={!qrDataUrl}
              className="text-xs text-center border border-gray-300 rounded-xl px-4 py-2.5 hover:bg-gray-50 transition disabled:opacity-50"
            >
              {qrMsg === "shared" ? `✓ ${t("step5.qrShare")}` : t("step5.qrShare")}
            </button>
          </div>
        </div>
        <p className="text-[11px] text-gray-400 mt-2">{t("step5.qrHelp")}</p>
      </div>

      {/* 공유 채널 */}
      <div>
        <h4 className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
          {t("step5.shareSection")}
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
        </div>
      </div>
    </div>
  );
}
