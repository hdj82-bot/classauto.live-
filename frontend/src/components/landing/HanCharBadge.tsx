"use client";

/**
 * 한자 한 글자를 골드 그라데이션 박스로 강조하는 마이크로 컴포넌트.
 *
 * 사용 위치: 랜딩 히어로 헤드라인 (예: "강의 영상이 [答] 한다 학생에게").
 * 06-student-flow 의 한자 강조 패턴 차용. 한 페이지에서 1회만 사용해 카지노
 * 느낌 방지 — colors.md §3 "페이지당 골드 영역 5곳 이내" 정책 준수.
 *
 * 가독성을 위해 ruby (한글 발음) 를 박스 하단에 작은 글씨로 함께 노출.
 * 한자만 보이는 외국 사용자도 의미를 짐작할 수 있게.
 *
 * prefers-reduced-motion 안전 — 호버 transform 만 있고 자동 애니메이션 없음.
 */
export default function HanCharBadge({
  character,
  reading,
}: {
  /** 강조할 한자 한 글자. 두 글자 이상은 줄 바꿈 위험. */
  character: string;
  /** 한글 발음 (한자 모르는 사용자 위한 ruby). */
  reading: string;
}) {
  return (
    <span
      role="img"
      aria-label={`${character} (${reading})`}
      className="relative inline-flex flex-col items-center align-baseline mx-1 sm:mx-2 select-none"
    >
      <span
        className="relative inline-flex items-center justify-center rounded-2xl px-2 sm:px-3 leading-none transition-transform duration-300 ease-out motion-reduce:transition-none hover:rotate-[-2deg] hover:scale-[1.04]"
        style={{
          background:
            "linear-gradient(135deg, #FFC74D 0%, #FFB627 50%, #E89E0B 100%)",
          color: "#1A1A1A",
          boxShadow:
            "0 4px 16px rgba(255,182,39,0.30), inset 0 1px 0 rgba(255,255,255,0.4)",
          fontFamily:
            "var(--font-han, 'Noto Sans CJK SC', 'Pretendard Variable'), serif",
          fontWeight: 900,
          paddingTop: "0.08em",
          paddingBottom: "0.08em",
        }}
      >
        {character}
      </span>
      <span
        aria-hidden="true"
        className="absolute -bottom-3 sm:-bottom-4 text-[10px] sm:text-xs tabular-nums tracking-[0.18em] uppercase text-[#B88308] font-semibold"
      >
        {reading}
      </span>
    </span>
  );
}
