"use client";

import { usePathname } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import ProfessorAppShell from "@/components/professor/shell/AppShell";

/**
 * /professor/* layout — v2 디자인.
 *
 * docs/prototypes/05-studio-flow.extracted.html 의 56px topbar + 220px 좌측
 * sidebar 구조. studio 마법사는 sidebar 없이 몰입형(`variant="focused"`)
 * 으로 분기.
 *
 * 라우팅 매트릭스:
 * - `/professor/studio` + `/professor/studio/[id]` → focused (sidebar 없음,
 *   3단 wizard 가 main 안에서 자체 그리드)
 * - 그 외 → default (sidebar + 메인)
 *
 * Topbar 의 title / saved chip 등 페이지별 컨텍스트는 layout 단에서 정하지 않고
 * 각 페이지가 자기 ShellContext 또는 자체 헤더 섹션으로 표현한다. layout 은
 * ProtectedRoute + 토큰 + 셸 골격만 책임진다.
 *
 * NOTE: 본 layout 은 globals.css / tailwind.config.ts 를 건드리지 않는다.
 * Geist 가 root 에 강제되어 있어도 본 wrapper 의 CSS 변수 `--font-body` 가
 * 자식 요소를 덮는다 (tokens.ts 의 fontFamily 참조).
 */
export default function ProfessorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // studio 영역 = 영상 제작 마법사 = 몰입형. sidebar 없음.
  const isFocused = pathname?.startsWith("/professor/studio") ?? false;

  // studio/[lectureId] 의 3단 wizard 는 main 자체가 스크롤 안 함 (내부에서
  // 각 column 이 독립 스크롤). 그 외는 main 이 스크롤.
  const mainScroll: "auto" | "hidden" = pathname?.match(
    /^\/professor\/studio\/[^/]+/,
  )
    ? "hidden"
    : "auto";

  return (
    <ProtectedRoute allowedRoles={["professor"]}>
      <ProfessorAppShell
        variant={isFocused ? "focused" : "default"}
        mainScroll={mainScroll}
        topbar={{
          showBack: pathname !== "/professor/dashboard",
        }}
      >
        {children}
      </ProfessorAppShell>
    </ProtectedRoute>
  );
}
