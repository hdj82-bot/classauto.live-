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
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ui/Han 과의 경계 (후속 정리 ② — 의도적 분리 유지, 흡수 대상 아님)
 *
 * DEPLOYMENT_PROGRESS 가 ui/Han 과 "중복" 으로 묶었으나 둘은 역할이 다르다:
 *   - ui/Han       : 본문 안의 한자 *단어* 를 `.han` 클래스로 인라인 강조
 *                    (serif + gold-on-light, 표면 톤 자동 추종). 텍스트 흐름.
 *   - HanCharBadge : 한자 *한 글자* 를 골드 그라데이션 *박스* + ruby 발음으로
 *                    장식하는 디스플레이 마이크로 컴포넌트 (히어로 한정, 1회).
 * 같은 한자 강조라도 한쪽은 typography, 한쪽은 decoration 이라 통합하면
 * 양쪽 호출자가 깨진다. → 별개 컴포넌트로 유지.
 *
 * 현재 import 처 0건(랜딩 히어로 v2 카피 PR #113 에서 배선 예정). 미사용
 * 이라고 ui/Han 으로 대체 불가 — 위 역할 차이 때문.
 * ─────────────────────────────────────────────────────────────────────────
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
