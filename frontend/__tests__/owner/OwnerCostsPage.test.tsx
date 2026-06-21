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
    // useFx 의 환율 조회를 결정적으로 — 실제 네트워크 차단.
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ rates: { KRW: 1380 } }),
    }) as unknown as typeof fetch;
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

    // 달러 + 원화 병기 — 총 비용 $3 × 1380 = ₩4,140 가 보조표기로 나타난다.
    await waitFor(() => {
      expect(screen.getByText("₩4,140")).toBeTruthy();
    });
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
});
