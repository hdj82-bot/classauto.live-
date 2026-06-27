import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/contexts/I18nContext";
import OwnerCostsPage from "@/app/owner/costs/page";

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@/lib/api", () => ({
  ownerCostsApi: { get: mocks.get },
}));

// ProtectedRoute 는 AuthContext 의존이라 테스트에선 passthrough 로 대체 —
// 본 페이지의 데이터/렌더 로직만 검증한다(권한 게이트는 백엔드 require_owner).
vi.mock("@/components/ProtectedRoute", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const wrap = (ui: React.ReactNode) => <I18nProvider>{ui}</I18nProvider>;

const SAMPLE = {
  generated_at: "2026-06-21T00:00:00Z",
  window_days: 365,
  currency: "USD",
  total_cost_usd: 3.0,
  month_to_date_usd: 1.0,
  user_count: 1,
  services: ["heygen", "elevenlabs"],
  by_service: [
    { service: "heygen", cost_usd: 2.5, calls: 1, seconds: 150, tokens: 0 },
    { service: "elevenlabs", cost_usd: 0.5, calls: 1, seconds: 0, tokens: 0 },
  ],
  by_month: [{ year: 2026, month: 6, cost_usd: 3.0 }],
  by_user: [
    {
      user_id: "u1",
      email: "prof@k.ac.kr",
      name: "하두진",
      role: "professor",
      total_usd: 3.0,
      calls: 2,
      by_service: { heygen: 2.5, elevenlabs: 0.5 },
    },
  ],
};

describe("OwnerCostsPage", () => {
  beforeEach(() => {
    mocks.get.mockReset();
  });

  it("renders per-service and per-user cost breakdown (i18n ko)", async () => {
    mocks.get.mockResolvedValue({ data: SAMPLE });
    render(wrap(<OwnerCostsPage />));

    // 제목(번역값) + 교수자 이메일이 표에 노출
    expect(await screen.findByText("API 비용 대시보드")).toBeTruthy();
    await waitFor(() => screen.getByText("prof@k.ac.kr"));

    // 종목명이 종목별 비용 + 사용자 표 헤더에 등장
    expect(screen.getAllByText("heygen").length).toBeGreaterThan(0);
    expect(screen.getAllByText("elevenlabs").length).toBeGreaterThan(0);
    // 요약 카드 라벨(번역값)
    expect(screen.getByText("당월 누적")).toBeTruthy();
    expect(screen.getByText("교수자별 사용 현황")).toBeTruthy();
  });

  it("shows owner-only fallback on 403", async () => {
    mocks.get.mockRejectedValue({ response: { status: 403 } });
    render(wrap(<OwnerCostsPage />));

    expect(
      await screen.findByText(
        "운영자 전용 화면입니다. 운영자 계정으로 로그인해 주세요.",
      ),
    ).toBeTruthy();
  });

  it("M5: 비-403 오류는 삼키지 않고 error 메시지를 노출한다", async () => {
    mocks.get.mockRejectedValue({ response: { status: 500 } });
    render(wrap(<OwnerCostsPage />));

    expect(
      await screen.findByText("비용 데이터를 불러오지 못했습니다."),
    ).toBeTruthy();
  });

  it("M5: 부분 200(배열 필드 누락)에도 안전 가드(?? [])로 크래시하지 않는다", async () => {
    // by_service / by_month / by_user / services 가 누락된 부분 응답.
    mocks.get.mockResolvedValue({
      data: {
        generated_at: "2026-06-21T00:00:00Z",
        total_cost_usd: 0,
        month_to_date_usd: 0,
        user_count: 0,
      },
    });
    render(wrap(<OwnerCostsPage />));

    // 제목은 렌더되고(=크래시 없음), total 0 이라 빈 안내가 보인다.
    expect(await screen.findByText("API 비용 대시보드")).toBeTruthy();
    expect(screen.getByText("아직 집계된 비용이 없습니다.")).toBeTruthy();
  });
});
