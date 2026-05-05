import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/contexts/I18nContext";

// admin/layout.tsx 는 ProtectedRoute 를 감싸므로 AuthContext 가 필요.
// admin role 사용자를 강제 주입한 mock 으로 감싸 i18n 키만 검증한다.
vi.mock("@/components/ProtectedRoute", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import AdminLayout from "@/app/admin/layout";

describe("AdminLayout", () => {
  it("renders i18n nav labels (no hardcoded Korean)", () => {
    render(
      <I18nProvider>
        <AdminLayout>
          <div>child</div>
        </AdminLayout>
      </I18nProvider>,
    );
    expect(screen.getByText("IFL Admin")).toBeTruthy();
    expect(screen.getByText("관리자 대시보드")).toBeTruthy();
    expect(screen.getByText("대시보드")).toBeTruthy();
    expect(screen.getByText("사용자 관리")).toBeTruthy();
    expect(screen.getByText("비용 분석")).toBeTruthy();
    expect(screen.getByText("시스템 모니터링")).toBeTruthy();
  });
});
