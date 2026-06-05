import type { ReactNode } from "react";
import { hanStyle } from "@/components/professor/shell";

/**
 * 본문 속 한자(CJK 통합 한자) 런을 골드 serif 로 강조한다 — CLAUDE.md 한자 강조
 * 정책(`--font-han` + `--gold-on-light`). 중어중문 전공 보고서에서 把字句·成語
 * 같은 한자 개념·질문이 시각적으로 드러나게 한다.
 *
 * localStorage·외부 의존 없이 순수 함수. CJK 런만 span 으로 감싸고 나머지는 그대로.
 * (split 용 정규식은 g 플래그, 판정용은 별도 — lastIndex 부작용 방지.)
 */
const HAN_SPLIT = /([㐀-鿿豈-﫿]+)/g;
const HAN_CHAR = /[㐀-鿿豈-﫿]/;

export function withHan(text: string | null | undefined): ReactNode {
  if (!text) return text ?? "";
  const parts = text.split(HAN_SPLIT);
  return parts.map((part, i) =>
    HAN_CHAR.test(part) ? (
      <span key={i} style={hanStyle}>
        {part}
      </span>
    ) : (
      part
    ),
  );
}
