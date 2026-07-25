"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";

interface InviteQrProps {
  /** 초대 링크 (`InviteResponse.invite_url`) — 스캔하면 /auth/invite?token=… */
  url: string;
  /** 파일명에 쓸 식별자 — 초대 대상 이메일. */
  label: string;
}

/**
 * 초대 링크 QR — 스펙 14 §A.
 *
 * 기능 3종: 표시 / PNG 다운로드 / 링크 복사.
 *
 * `professor/studio/ShareLinks.tsx` 와 동일 패턴으로 `qrcode` 를 동적 import
 * 한다. 인코딩 테이블을 포함한 라이브러리라 admin 초기 번들에서 빼야 한다
 * (QR 패널을 실제로 펼칠 때만 필요).
 *
 * 다운로드·복사는 브라우저가 조용히 처리해 "아무 반응 없음"처럼 보이므로,
 * ShareLinks 와 같이 클릭 직후 1.8초 ✓ 피드백을 띄운다.
 */
export default function InviteQr({ url, label }: InviteQrProps) {
  const { t } = useI18n();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [flash, setFlash] = useState<"downloaded" | "copied" | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(url, {
          width: 480,
          margin: 2,
          errorCorrectionLevel: "M",
        }),
      )
      .then((d) => {
        if (!cancelled) setQrDataUrl(d);
      })
      .catch(() => {
        if (cancelled) return;
        setQrDataUrl(null);
        setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const flashFor = (kind: "downloaded" | "copied") => {
    setFlash(kind);
    window.setTimeout(() => setFlash(null), 1800);
  };

  // 워크숍 현장에서 여러 장을 내려받아도 파일이 구분되도록 대상 이메일을 파일명에.
  const fileName = `invite-${(label || "professor").replace(/[\\/:*?"<>|@]+/g, "_")}-QR.png`;

  const download = () => {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    flashFor("downloaded");
  };

  const copy = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(url);
      flashFor("copied");
    } catch {
      // 클립보드 차단 환경 — 아래 readonly input 을 직접 선택해 복사할 수 있다.
    }
  };

  return (
    <div className="animate-fade-in mt-3 flex flex-col gap-4 rounded-xl border border-line bg-bg-subtle p-4 sm:flex-row">
      {/* QR 이미지 — 클릭해도 다운로드된다(이미지 클릭 관습). */}
      <div className="shrink-0">
        {qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrDataUrl}
            alt={t("admin.invites.qrTitle")}
            width={148}
            height={148}
            onClick={download}
            title={t("admin.invites.qrDownload")}
            className="cursor-pointer rounded-lg border border-line bg-bg-card p-2 transition hover:border-line-strong"
          />
        ) : failed ? (
          <div className="flex h-[148px] w-[148px] items-center justify-center rounded-lg border border-line bg-bg-card p-3 text-center text-xs text-text-subtle">
            {t("admin.invites.qrError")}
          </div>
        ) : (
          <div className="studio-skeleton-block h-[148px] w-[148px] rounded-lg border border-line" />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-xs text-text-muted">{t("admin.invites.qrHint")}</p>

        <label className="sr-only" htmlFor={`invite-url-${label}`}>
          {t("admin.invites.urlLabel")}
        </label>
        <input
          id={`invite-url-${label}`}
          type="text"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full rounded-lg border border-line bg-bg-card px-3 py-2 text-xs text-text-muted outline-none"
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={download}
            disabled={!qrDataUrl}
            className="rounded-lg bg-gold-on-light px-3 py-2 text-xs font-semibold text-white transition hover:bg-gold-deep disabled:opacity-50"
          >
            {flash === "downloaded"
              ? `✓ ${t("admin.invites.qrDownload")}`
              : t("admin.invites.qrDownload")}
          </button>
          <button
            type="button"
            onClick={copy}
            className="rounded-lg border border-line-strong bg-bg-card px-3 py-2 text-xs font-semibold text-text-muted transition hover:bg-bg-hover"
          >
            {flash === "copied"
              ? `✓ ${t("admin.invites.copied")}`
              : t("admin.invites.copy")}
          </button>
        </div>
      </div>
    </div>
  );
}
