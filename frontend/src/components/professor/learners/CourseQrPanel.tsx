"use client";

import { useEffect, useState } from "react";
import { useLearnersI18n } from "./useLearnersI18n";

/**
 * Course QR — 학기 초 첫 수업 슬라이드에 띄워 **전원 한 번에 스캔**시키는 용도.
 *
 * 강의별 QR(스튜디오 5단계 `ShareLinks`)과 다른 물건이다. 그쪽은 12주차면 QR 도
 * 12개고 매주 다시 뿌려야 한다 — 매주 배포가 곧 매주의 이탈 지점이다(스펙 15 §1.1).
 * 이 QR 은 학기당 한 번이면 끝나고, 이후 발행되는 강의는 학생 목록에 자동으로 붙는다.
 *
 * 동작은 `ShareLinks` 와 같은 패턴을 따른다 — qrcode 동적 import(초기 번들에서 분리),
 * `toDataURL(width 480, margin 2, errorCorrectionLevel "M")`, 그리고 다운로드·복사
 * 직후 1.8초 ✓ 피드백. 브라우저가 조용히 처리해 "아무 반응 없음"처럼 보이기 때문이다.
 */
interface CourseQrPanelProps {
  courseSlug: string;
  courseTitle: string;
}

export default function CourseQrPanel({
  courseSlug,
  courseTitle,
}: CourseQrPanelProps) {
  const { t } = useLearnersI18n();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [flash, setFlash] = useState<"copied" | "downloaded" | null>(null);
  const [origin, setOrigin] = useState("");

  // SSR 에는 window 가 없다 — 마운트 후에 절대 URL 을 만든다(QR 은 절대 주소여야
  // 스캔한 휴대폰이 열 수 있다).
  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  const url = origin ? `${origin}/c/${courseSlug}` : "";

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(url, { width: 480, margin: 2, errorCorrectionLevel: "M" }),
      )
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

  const flashFor = (kind: "copied" | "downloaded") => {
    setFlash(kind);
    setTimeout(() => setFlash(null), 1800);
  };

  const copyLink = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard || !url) return;
    try {
      await navigator.clipboard.writeText(url);
      flashFor("copied");
    } catch {
      // 클립보드 거부는 조용히 무시 — 아래 입력칸에서 직접 선택할 수 있다.
    }
  };

  const downloadQr = () => {
    if (!qrDataUrl) return;
    const safe = (courseTitle || "course").replace(/[\\/:*?"<>|]+/g, "_");
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `${safe}-QR.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    flashFor("downloaded");
  };

  return (
    <div
      data-testid="course-qr-panel"
      style={{
        padding: "16px 20px",
        borderTop: "1px solid var(--line)",
        background: "var(--bg-subtle)",
      }}
    >
      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: "var(--text-muted)" }}>
        {t("qrHelp")}
      </p>

      <div className="flex flex-wrap items-center gap-4" style={{ marginTop: 12 }}>
        {qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrDataUrl}
            alt={t("qrAlt")}
            width={132}
            height={132}
            onClick={downloadQr}
            title={t("qrDownload")}
            style={{
              borderRadius: 10,
              border: "1px solid var(--line)",
              background: "#fff",
              padding: 8,
              cursor: "pointer",
            }}
          />
        ) : (
          <div
            aria-hidden="true"
            style={{
              width: 132,
              height: 132,
              borderRadius: 10,
              border: "1px solid var(--line)",
              background: "var(--bg-card)",
            }}
          />
        )}

        <div className="min-w-0 flex-1" style={{ minWidth: 220 }}>
          <label
            htmlFor={`course-link-${courseSlug}`}
            style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.08em" }}
          >
            {t("qrLinkLabel")}
          </label>
          <input
            id={`course-link-${courseSlug}`}
            type="text"
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            style={{
              width: "100%",
              marginTop: 5,
              padding: "8px 10px",
              fontSize: 12.5,
              color: "var(--text)",
              background: "var(--bg-card)",
              border: "1px solid var(--line)",
              borderRadius: 8,
              fontFamily: "inherit",
            }}
          />
          <div className="flex flex-wrap gap-2" style={{ marginTop: 8 }}>
            <button
              type="button"
              onClick={downloadQr}
              disabled={!qrDataUrl}
              style={btnPrimary(!qrDataUrl)}
              data-testid="course-qr-download"
            >
              {flash === "downloaded" ? `✓ ${t("qrDownload")}` : t("qrDownload")}
            </button>
            <button
              type="button"
              onClick={copyLink}
              disabled={!url}
              style={btnSecondary(!url)}
              data-testid="course-qr-copy"
            >
              {flash === "copied" ? `✓ ${t("qrCopy")}` : t("qrCopy")}
            </button>
            <a
              href={url || undefined}
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...btnSecondary(false), textDecoration: "none", display: "inline-block" }}
              data-testid="course-qr-preview"
            >
              {t("qrPreview")}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

const btnBase = {
  padding: "7px 13px",
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 8,
  cursor: "pointer",
  fontFamily: "inherit",
  transition: "all 140ms var(--ease-out)",
} as const;

const btnPrimary = (disabled: boolean) => ({
  ...btnBase,
  color: "var(--gold)",
  background: "var(--gold-soft)",
  border: "1px solid var(--gold-medium)",
  opacity: disabled ? 0.5 : 1,
  cursor: disabled ? "default" : "pointer",
});

const btnSecondary = (disabled: boolean) => ({
  ...btnBase,
  color: "var(--text-muted)",
  background: "var(--bg-card)",
  border: "1px solid var(--line)",
  opacity: disabled ? 0.5 : 1,
  cursor: disabled ? "default" : "pointer",
});
