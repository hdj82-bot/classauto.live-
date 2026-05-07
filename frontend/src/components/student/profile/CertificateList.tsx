"use client";

import { useCallback } from "react";
import { useToast } from "@/components/ui/Toast";
import Mascot from "./Mascot";
import type { Certificate } from "./types";
import { useProfileHubI18n } from "./useProfileHubI18n";

interface Props {
  items: Certificate[];
}

/**
 * 수강 완료 인증서 목록.
 *
 * - PDF 다운로드 / 공유 링크 두 액션. 백엔드 endpoint 미구현 시 비활성 + 안내.
 * - 외부 SNS 공유 액션은 만들지 않는다 — 학생 데이터 보호 정책상 외부 공유는
 *   "학생 본인이 명시적으로 발급 받은 공유 링크" 한 가지 경로만 허용.
 * - 마스코트는 카드 헤더 작은 일러스트로만 등장 (mascot.md §3.3, §5.1).
 */
export default function CertificateList({ items }: Props) {
  const { t } = useProfileHubI18n();
  const { toast } = useToast();

  const onCopyShare = useCallback(
    async (cert: Certificate) => {
      if (!cert.shareUrl) {
        toast(t("profileHub.certificates.backendPending"), "info");
        return;
      }
      try {
        await navigator.clipboard.writeText(cert.shareUrl);
        toast(t("profileHub.certificates.shareCopied"), "success");
      } catch {
        toast(t("profileHub.certificates.shareCopyError"), "error");
      }
    },
    [t, toast],
  );

  return (
    <section
      data-testid="profile-certificates"
      aria-labelledby="profile-certificates-heading"
      className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-6"
    >
      <header className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2
            id="profile-certificates-heading"
            className="text-base font-semibold text-white"
          >
            {t("profileHub.certificates.title")}
          </h2>
          <p className="text-xs text-white/55 mt-1">
            {t("profileHub.certificates.subtitle")}
          </p>
        </div>
        <Mascot expression="encouraging" size={56} className="shrink-0" />
      </header>

      {items.length === 0 ? (
        <p
          data-testid="profile-certificates-empty"
          className="text-xs text-white/40 py-6 text-center"
        >
          {t("profileHub.certificates.empty")}
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((c) => {
            const pdfDisabled = !c.pdfUrl;
            const shareDisabled = !c.shareUrl;
            return (
              <li
                key={c.id}
                data-testid={`certificate-${c.id}`}
                className="rounded-xl bg-white/[0.03] border border-white/5 p-4 flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">{c.title}</p>
                  <p className="text-[11px] text-white/45 mt-0.5">
                    {t("profileHub.certificates.issuedOn", { date: c.issuedAt })}
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                  <a
                    href={c.pdfUrl ?? "#"}
                    onClick={(e) => {
                      if (pdfDisabled) {
                        e.preventDefault();
                        toast(t("profileHub.certificates.backendPending"), "info");
                      }
                    }}
                    aria-disabled={pdfDisabled}
                    download={c.pdfUrl ? `${c.title}.pdf` : undefined}
                    data-testid={`certificate-${c.id}-pdf`}
                    className={[
                      "inline-flex items-center justify-center text-xs font-medium rounded-lg px-3 py-1.5 transition motion-reduce:transition-none",
                      pdfDisabled
                        ? "border border-white/10 text-white/30 cursor-not-allowed"
                        : "bg-amber-400 text-black hover:bg-amber-300",
                    ].join(" ")}
                  >
                    {t("profileHub.certificates.downloadCta")}
                  </a>
                  <button
                    type="button"
                    onClick={() => onCopyShare(c)}
                    disabled={shareDisabled}
                    data-testid={`certificate-${c.id}-share`}
                    className={[
                      "inline-flex items-center justify-center text-xs font-medium rounded-lg px-3 py-1.5 transition motion-reduce:transition-none",
                      shareDisabled
                        ? "border border-white/10 text-white/30 cursor-not-allowed"
                        : "border border-white/15 text-white hover:border-white/30 hover:bg-white/[0.04]",
                    ].join(" ")}
                  >
                    {t("profileHub.certificates.shareCta")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-[11px] text-white/35 mt-4 leading-relaxed">
        {t("profileHub.certificates.backendPending")}
      </p>
    </section>
  );
}
