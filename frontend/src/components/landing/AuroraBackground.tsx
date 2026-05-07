"use client";

import { useLandingI18n } from "./useLandingI18n";

/**
 * Aurora 배경 — docs/design-system/animations.md §2.1.
 *
 * 다중 radial-gradient 가 60초 주기로 부드럽게 이동. ElevenLabs 풍의 분위기
 * 레이어. 본문 콘텐츠 위에 얹지 않도록 absolute + pointer-events:none 적용.
 *
 * `prefers-reduced-motion: reduce` 일 때 transform 애니메이션 자동 비활성
 * (CSS @media 가 처리). 정적 그라데이션은 유지되어 시각적 임팩트는 보존.
 *
 * 라이트 / 다크 모두에서 자연스러운 강도. opacity 가 낮아 본문 가독성 영향 없음.
 */
export default function AuroraBackground() {
  const { t } = useLandingI18n();
  return (
    <div
      role="presentation"
      aria-label={t("a11y.auroraDecoration")}
      aria-hidden="true"
      className="aurora-bg pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <style>{`
        .aurora-bg::before,
        .aurora-bg::after {
          content: '';
          position: absolute;
          inset: -10% -10%;
          border-radius: 9999px;
          will-change: transform;
        }
        .aurora-bg::before {
          background:
            radial-gradient(ellipse at 20% 30%, rgba(167, 139, 250, 0.18), transparent 50%),
            radial-gradient(ellipse at 80% 70%, rgba(255, 182, 39, 0.14), transparent 50%),
            radial-gradient(ellipse at 50% 50%, rgba(34, 211, 238, 0.10), transparent 60%);
          animation: aurora-shift 60s ease-in-out infinite;
        }
        .aurora-bg::after {
          background:
            radial-gradient(ellipse at 65% 25%, rgba(99, 102, 241, 0.10), transparent 55%),
            radial-gradient(ellipse at 35% 80%, rgba(244, 114, 182, 0.08), transparent 55%);
          animation: aurora-shift 90s ease-in-out infinite reverse;
        }
        @keyframes aurora-shift {
          0%, 100% { transform: translate(0, 0); }
          33% { transform: translate(2%, -1%); }
          66% { transform: translate(-1%, 2%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .aurora-bg::before,
          .aurora-bg::after {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
