"use client";

/**
 * 미니멀 올빼미 마스코트 SVG.
 *
 * `docs/design-system/mascot.md` §3.1 (도형 기반) + §3.2 (회갈색 단색) 정확
 * 매핑. 본 PR 에서는 학습자 마이페이지 "축하" 모달과 인증서 카드 헤더에서만
 * 사용 — 마스코트 등장 위치 정책 §5.1 ("학습자 마이페이지 — 스트릭·인증서")
 * 에 부합.
 *
 * 표정 6종 중 본 PR 은 "encouraging" / "welcoming" 두 가지만 노출 — 마이페이지
 * 가 격려·축하 컨텍스트라 적합. "concerned/surprised/focused" 는 집중 경고용
 * (별도 컴포넌트, 본 PR 외).
 */
type Expression = "encouraging" | "welcoming";

interface Props {
  expression?: Expression;
  size?: number;
  className?: string;
  /** prefers-reduced-motion 또는 사용자 토글 시 호흡 애니메이션 끔. */
  reduceMotion?: boolean;
}

export default function Mascot({
  expression = "encouraging",
  size = 96,
  className = "",
  reduceMotion = false,
}: Props) {
  return (
    <svg
      data-testid={`mascot-${expression}`}
      width={size}
      height={size}
      viewBox="0 0 200 240"
      role="img"
      aria-label={expression}
      className={[
        "mascot",
        reduceMotion ? "" : "motion-safe:animate-[breathe_4s_ease-in-out_infinite]",
        className,
      ].join(" ")}
    >
      {/* 몸 (둥근 사각형) */}
      <ellipse cx="100" cy="160" rx="68" ry="78" fill="#6B5B47" />
      {/* 가슴 라이트 영역 */}
      <ellipse cx="100" cy="180" rx="38" ry="52" fill="#A89678" />
      {/* 머리 — 몸과 자연 연결 (위쪽 살짝 좁게) */}
      <ellipse cx="100" cy="92" rx="64" ry="58" fill="#6B5B47" />
      {/* 귀깃 (선택적, 작게) */}
      <polygon points="55,52 70,30 78,55" fill="#5A4D3D" />
      <polygon points="145,52 130,30 122,55" fill="#5A4D3D" />
      {/* 눈 흰자 */}
      <circle cx="78" cy="92" r="20" fill="#F5EFE3" />
      <circle cx="122" cy="92" r="20" fill="#F5EFE3" />
      {/* 눈동자 — encouraging/welcoming 모두 정중앙 */}
      <circle cx="78" cy="94" r="9" fill="#1A1A1A" />
      <circle cx="122" cy="94" r="9" fill="#1A1A1A" />
      {/* 살짝 미소 (입꼬리 곡선) — encouraging 전용 */}
      {expression === "encouraging" && (
        <path
          d="M 88 122 Q 100 130 112 122"
          stroke="#5A4D3D"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
      )}
      {/* 부리 */}
      <polygon points="92,118 108,118 100,128" fill="#D4923A" />
      {/* 환영 — 한쪽 날개 살짝 들기 */}
      {expression === "welcoming" && (
        <path
          d="M 168 170 Q 188 150 180 130"
          stroke="#6B5B47"
          strokeWidth="14"
          strokeLinecap="round"
          fill="none"
        />
      )}

      {/* 호흡 keyframe — 한 번만 정의되어도 모든 mascot 인스턴스가 공유 */}
      <style>{`
        @keyframes breathe {
          0%, 100% { transform: scale(1); transform-origin: center; }
          50% { transform: scale(1.02); transform-origin: center; }
        }
        @media (prefers-reduced-motion: reduce) {
          .mascot { animation: none !important; }
        }
      `}</style>
    </svg>
  );
}
