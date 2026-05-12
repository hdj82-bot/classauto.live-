"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * 페이지 콘텐츠 wrapper. AppShell 의 main 이 padding 을 두지 않으므로 각 페이지는
 * 본 컨테이너로 자신을 감싸 max-width / padding 을 일관 적용한다.
 *
 * docs/prototypes/05-studio-flow.extracted.html 의 work-scroll padding 패턴
 * (`20px 28px 24px`) 을 데스크톱 기준 그대로 옮긴 것. 모바일은 좁힘.
 *
 * `narrow` 옵션은 폼·결제 등 1열 좁은 페이지에 사용 (`max-width: 720px`).
 */
export interface PageContainerProps {
  children: ReactNode;
  /** "narrow" = 720, "wide" = 1280 (기본), "full" = 100% */
  width?: "narrow" | "wide" | "full";
  /** 위아래 padding 줄임 (대시보드 hero header 같이 자체 padding 가지는 경우). */
  compact?: boolean;
}

const widthMap: Record<NonNullable<PageContainerProps["width"]>, number | "none"> = {
  narrow: 720,
  wide: 1280,
  full: "none" as const,
};

export default function PageContainer({
  children,
  width = "wide",
  compact = false,
}: PageContainerProps) {
  const max = widthMap[width];

  const style: CSSProperties = {
    width: "100%",
    maxWidth: max === "none" ? undefined : max,
    margin: "0 auto",
    padding: compact ? "16px 28px 20px" : "28px 28px 40px",
  };

  return <div style={style}>{children}</div>;
}
