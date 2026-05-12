"use client";

/**
 * @deprecated v2 (2026-05-12)
 *
 * 마스코트 정책이 폐기되었습니다 (docs/design-system/mascot.md).
 * 호환을 위해 컴포넌트 시그니처는 유지하되, 실제 렌더는 BrandDot 으로
 * 대체합니다. 호출자(DemoCTAModal 등) 가 v2 디자인으로 재작업될 때
 * 이 import 를 제거해 주세요 — 그 시점에 본 파일도 삭제 가능.
 *
 * 폐기 사유: 05·06 prototype 어디에도 마스코트가 등장하지 않아 시각 일관성
 * 위해 정책 자체를 제거. 정서적 연결은 골드 그라데이션·타이포·일러스트로 처리.
 */

import BrandDot from "@/components/ui/BrandDot";

export default function OwlMascot({
  size = 96,
  className,
}: {
  size?: number;
  className?: string;
}) {
  // 마스코트 자리에 골드 dot 을 떨어뜨려 시각적 공백을 메우되, 정체성은
  // 새 디자인 톤(브랜드 dot)으로 자연 전환.
  return <BrandDot size={size} className={className} ariaHidden={false} />;
}
