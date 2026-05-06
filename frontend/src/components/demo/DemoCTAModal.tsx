"use client";

import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import OwlMascot from "./OwlMascot";
import { useDemoI18n } from "./useDemoI18n";

interface Props {
  open: boolean;
  onClose: () => void;
  onReplay: () => void;
}

/**
 * 체험 종료 후 CTA 모달.
 *
 * docs/planning/04-demo-page.md Section 13 참조.
 * - 올빼미 마스코트 첫 등장 (체험 중에는 안 나오다가 마지막에)
 * - 베타 신청 / 가격 보기 / 공유 4채널 / 한 번 더 체험
 *
 * 공유 URL은 React state 가 아니라 클릭 시점에 `window.location` 에서
 * 즉석 계산한다 — 렌더 사이클에서 `window` 접근을 피하고
 * react-hooks/set-state-in-effect 규칙을 회피하기 위한 패턴.
 */
function getShareUrl() {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  url.searchParams.set("utm_source", "demo");
  return url.toString();
}

export default function DemoCTAModal({ open, onClose, onReplay }: Props) {
  const { t } = useDemoI18n();
  const { toast } = useToast();

  const handleCopyUrl = async () => {
    const shareUrl = getShareUrl();
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast(t("ctaModal.shareUrlDone"), "success");
    } catch {
      toast(t("ctaModal.shareUrlDone"), "info");
    }
  };

  const handleEmailShare: React.MouseEventHandler<HTMLAnchorElement> = (e) => {
    const shareUrl = getShareUrl();
    const subject = encodeURIComponent("ClassAuto 데모 체험");
    const body = encodeURIComponent(
      `교수님께 추천드리는 데모 페이지입니다: ${shareUrl}`,
    );
    e.currentTarget.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const handleXShare: React.MouseEventHandler<HTMLAnchorElement> = (e) => {
    const shareUrl = getShareUrl();
    const xText = encodeURIComponent(
      "학자가 학자를 위해 만든 AI 플립러닝 도구, ClassAuto 데모를 체험해보세요.",
    );
    e.currentTarget.href = `https://twitter.com/intent/tweet?text=${xText}&url=${encodeURIComponent(
      shareUrl,
    )}`;
  };

  return (
    <Modal open={open} onClose={onClose} closable>
      <div className="flex flex-col items-center text-center pt-2">
        <div className="mb-4">
          <OwlMascot size={88} />
        </div>

        <h2
          className="text-2xl font-bold text-gray-900 dark:text-white mb-3"
          style={{ fontFamily: "'Paperlogy', 'Pretendard Variable', sans-serif", letterSpacing: "-0.03em" }}
        >
          {t("ctaModal.title")}
        </h2>
        <p className="text-sm text-gray-600 dark:text-white/65 leading-relaxed max-w-md mb-6">
          {t("ctaModal.body")}
        </p>

        <div className="flex flex-col gap-2 w-full max-w-sm">
          <a
            href="/beta-apply"
            className="w-full inline-flex items-center justify-center px-6 py-3.5 rounded-xl bg-[#FFB627] text-[#0A0A0A] font-semibold text-sm hover:bg-[#FFC74D] transition shadow-lg shadow-[#FFB627]/20"
            data-testid="demo-cta-beta"
          >
            {t("ctaModal.primary")}
          </a>
          <a
            href="/pricing"
            className="w-full inline-flex items-center justify-center px-6 py-3 rounded-xl border border-gray-300 dark:border-white/15 text-gray-700 dark:text-white/85 font-medium text-sm hover:bg-gray-50 dark:hover:bg-white/5 transition"
          >
            {t("ctaModal.secondary")}
          </a>
        </div>

        <div className="mt-7 w-full">
          <p className="text-[11px] uppercase tracking-[0.18em] text-gray-400 dark:text-white/40 mb-3">
            {t("ctaModal.shareTitle")}
          </p>
          <div className="grid grid-cols-4 gap-2">
            <a
              href="#"
              onClick={handleEmailShare}
              className="px-2 py-2.5 rounded-lg border border-gray-200 dark:border-white/10 text-xs text-gray-700 dark:text-white/80 hover:border-[#FFB627]/40 transition"
            >
              📧 {t("ctaModal.shareEmail")}
            </a>
            <button
              type="button"
              onClick={() => toast("Kakao SDK 연동은 W4 단계", "info")}
              className="px-2 py-2.5 rounded-lg border border-gray-200 dark:border-white/10 text-xs text-gray-700 dark:text-white/80 hover:border-[#FFB627]/40 transition"
            >
              💬 {t("ctaModal.shareKakao")}
            </button>
            <a
              href="#"
              onClick={handleXShare}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2 py-2.5 rounded-lg border border-gray-200 dark:border-white/10 text-xs text-gray-700 dark:text-white/80 hover:border-[#FFB627]/40 transition"
            >
              🐦 {t("ctaModal.shareX")}
            </a>
            <button
              type="button"
              onClick={handleCopyUrl}
              className="px-2 py-2.5 rounded-lg border border-gray-200 dark:border-white/10 text-xs text-gray-700 dark:text-white/80 hover:border-[#FFB627]/40 transition"
            >
              🔗 {t("ctaModal.shareUrl")}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            onReplay();
            onClose();
          }}
          className="mt-5 text-xs text-gray-500 dark:text-white/45 hover:text-gray-800 dark:hover:text-white transition"
          data-testid="demo-cta-replay"
        >
          {t("ctaModal.replay")}
        </button>
      </div>
    </Modal>
  );
}
