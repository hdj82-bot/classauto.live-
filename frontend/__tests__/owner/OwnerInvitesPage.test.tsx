import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/contexts/I18nContext";
import OwnerInvitesPage from "@/app/owner/invites/page";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  revoke: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  ownerInviteApi: {
    list: mocks.list,
    create: mocks.create,
    revoke: mocks.revoke,
  },
}));

// ProtectedRoute 는 AuthContext 의존이라 passthrough 로 대체 — 데이터/렌더 로직만 검증.
vi.mock("@/components/ProtectedRoute", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const wrap = (ui: React.ReactNode) => <I18nProvider>{ui}</I18nProvider>;

const SAMPLE = [
  {
    id: "i1",
    email: "prof@k.ac.kr",
    status: "active",
    invite_url: "https://classauto.live/invite/abc",
  },
];

describe("OwnerInvitesPage", () => {
  beforeEach(() => {
    mocks.list.mockReset();
    mocks.create.mockReset();
    mocks.revoke.mockReset();
  });

  it("renders the invite list (i18n ko)", async () => {
    mocks.list.mockResolvedValue({ data: SAMPLE });
    render(wrap(<OwnerInvitesPage />));

    expect(await screen.findByText("prof@k.ac.kr")).toBeTruthy();
  });

  it("shows owner-only fallback on 403", async () => {
    mocks.list.mockRejectedValue({ response: { status: 403 } });
    render(wrap(<OwnerInvitesPage />));

    expect(
      await screen.findByText(
        "운영자 전용 화면입니다. 계정주 계정으로 로그인하세요.",
      ),
    ).toBeTruthy();
  });

  it("M5: 비-403 오류는 삼키지 않고 error 메시지를 노출한다(빈 목록처럼 보이지 않음)", async () => {
    mocks.list.mockRejectedValue({ response: { status: 500 } });
    render(wrap(<OwnerInvitesPage />));

    expect(
      await screen.findByText("초대 목록을 불러오지 못했습니다."),
    ).toBeTruthy();
    // "아직 발급한 초대가 없습니다." 빈 안내가 아니라 에러가 떠야 한다.
    expect(screen.queryByText("아직 발급한 초대가 없습니다.")).toBeNull();
  });

  it("M5: 배열이 아닌 응답(부분 200)에도 빈 목록 안내로 안전 가드", async () => {
    mocks.list.mockResolvedValue({ data: null });
    render(wrap(<OwnerInvitesPage />));

    expect(
      await screen.findByText("아직 발급한 초대가 없습니다."),
    ).toBeTruthy();
  });
});
