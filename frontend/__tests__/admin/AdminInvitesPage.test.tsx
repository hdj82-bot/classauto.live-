import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { I18nProvider } from "@/contexts/I18nContext";
import AdminInvitesPage from "@/app/admin/invites/page";

/**
 * 스펙 14 §A — `/owner/invites` 에서 이관된 화면.
 * 종전 `__tests__/owner/OwnerInvitesPage.test.tsx` 의 목록·403·부분200 케이스를
 * 그대로 승계하고, 신규 항목(cohort 전달 · QR 자동 표시)을 추가한다.
 */

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  revoke: vi.fn(),
  toDataURL: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  ownerInviteApi: {
    list: mocks.list,
    create: mocks.create,
    revoke: mocks.revoke,
  },
}));

// qrcode 는 브라우저 빌드가 canvas 를 요구해 jsdom 에서 불안정하다. 이 화면의
// 검증 대상은 "QR 패널이 뜨는가"이지 인코딩 정확도가 아니므로 mock 으로 대체.
vi.mock("qrcode", () => ({
  default: { toDataURL: mocks.toDataURL },
}));

const wrap = (ui: React.ReactNode) => <I18nProvider>{ui}</I18nProvider>;

const SAMPLE = [
  {
    id: "i1",
    token: "abc",
    email: "prof@k.ac.kr",
    role: "professor",
    cohort: "2026-08",
    status: "active",
    invite_url: "https://classauto.live/auth/invite?token=abc",
    created_at: "2026-07-25T00:00:00Z",
    expires_at: "2026-08-01T00:00:00Z",
    used_at: null,
  },
];

describe("AdminInvitesPage", () => {
  beforeEach(() => {
    mocks.list.mockReset();
    mocks.create.mockReset();
    mocks.revoke.mockReset();
    mocks.toDataURL.mockReset();
    mocks.toDataURL.mockResolvedValue("data:image/png;base64,QQ==");
  });

  it("renders the invite list with its cohort (i18n ko)", async () => {
    mocks.list.mockResolvedValue({ data: SAMPLE });
    render(wrap(<AdminInvitesPage />));

    expect(await screen.findByText("prof@k.ac.kr")).toBeTruthy();
    // "2026-08" 은 코호트 셀렉트의 option 에도 있으므로 목록 행 안으로 좁힌다.
    const row = screen.getByRole("listitem");
    expect(within(row).getByText("2026-08")).toBeTruthy();
    expect(within(row).getByText("유효")).toBeTruthy();
  });

  it("shows owner-only fallback on 403", async () => {
    mocks.list.mockRejectedValue({ response: { status: 403 } });
    render(wrap(<AdminInvitesPage />));

    expect(
      await screen.findByText(
        "운영자 전용 화면입니다. 계정주 계정으로 로그인하세요.",
      ),
    ).toBeTruthy();
  });

  it("비-403 오류는 삼키지 않고 error 메시지를 노출한다(빈 목록처럼 보이지 않음)", async () => {
    mocks.list.mockRejectedValue({ response: { status: 500 } });
    render(wrap(<AdminInvitesPage />));

    expect(
      await screen.findByText("초대 목록을 불러오지 못했습니다."),
    ).toBeTruthy();
    expect(screen.queryByText("아직 발급한 초대가 없습니다.")).toBeNull();
  });

  it("배열이 아닌 응답(부분 200)에도 빈 목록 안내로 안전 가드", async () => {
    mocks.list.mockResolvedValue({ data: null });
    render(wrap(<AdminInvitesPage />));

    expect(
      await screen.findByText("아직 발급한 초대가 없습니다."),
    ).toBeTruthy();
  });

  it("발급 시 선택한 cohort 를 함께 보내고, 직후 QR 패널이 펼쳐진다", async () => {
    mocks.list.mockResolvedValue({ data: [] });
    mocks.create.mockResolvedValue({ data: SAMPLE[0] });

    render(wrap(<AdminInvitesPage />));
    await screen.findByText("아직 발급한 초대가 없습니다.");

    fireEvent.change(screen.getByLabelText("초대할 이메일 (선택)"), {
      target: { value: "prof@k.ac.kr" },
    });
    fireEvent.change(screen.getByLabelText("코호트"), {
      target: { value: "2026-08" },
    });
    fireEvent.click(screen.getByRole("button", { name: "초대 링크 · QR 생성" }));

    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith("prof@k.ac.kr", "2026-08"),
    );

    // 수용 기준: "발급 → QR이 즉시 뜨고" — 새 초대의 QR 패널이 자동으로 열린다.
    expect(
      await screen.findByAltText("초대 링크 QR"),
    ).toBeTruthy();
    expect(mocks.toDataURL).toHaveBeenCalledWith(
      SAMPLE[0].invite_url,
      expect.objectContaining({ width: 480, errorCorrectionLevel: "M" }),
    );
  });

  it("이메일 없이도 발급된다 — 공개 초대(1회용 링크·QR)", async () => {
    mocks.list.mockResolvedValue({ data: [] });
    mocks.create.mockResolvedValue({ data: { ...SAMPLE[0], email: null } });

    render(wrap(<AdminInvitesPage />));
    await screen.findByText("아직 발급한 초대가 없습니다.");

    // 이메일을 비운 채 바로 발급 — 버튼이 잠겨 있으면 안 된다.
    const createBtn = screen.getByRole("button", { name: "초대 링크 · QR 생성" });
    expect(createBtn.hasAttribute("disabled")).toBe(false);
    fireEvent.click(createBtn);

    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(null, null));
    // 발급 직후 QR 이 바로 떠야 전달할 수 있다.
    expect(await screen.findByAltText("초대 링크 QR")).toBeTruthy();
  });

  it("공개 초대는 목록에서 대상 미지정임을 밝힌다", async () => {
    mocks.list.mockResolvedValue({ data: [{ ...SAMPLE[0], email: null }] });
    render(wrap(<AdminInvitesPage />));

    const row = await screen.findByRole("listitem");
    expect(within(row).getByText("공개 초대 (대상 미지정)")).toBeTruthy();
  });

  it("코호트 미지정이면 cohort 를 null 로 보낸다", async () => {
    mocks.list.mockResolvedValue({ data: [] });
    mocks.create.mockResolvedValue({ data: { ...SAMPLE[0], cohort: null } });

    render(wrap(<AdminInvitesPage />));
    await screen.findByText("아직 발급한 초대가 없습니다.");

    fireEvent.change(screen.getByLabelText("초대할 이메일 (선택)"), {
      target: { value: "p2@k.ac.kr" },
    });
    fireEvent.change(screen.getByLabelText("코호트"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "초대 링크 · QR 생성" }));

    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith("p2@k.ac.kr", null),
    );
  });

  it("목록의 QR 버튼으로 과거 초대의 QR 을 다시 꺼낼 수 있다", async () => {
    mocks.list.mockResolvedValue({ data: SAMPLE });

    render(wrap(<AdminInvitesPage />));
    await screen.findByText("prof@k.ac.kr");

    expect(screen.queryByAltText("초대 링크 QR")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "QR" }));
    expect(await screen.findByAltText("초대 링크 QR")).toBeTruthy();
  });
});
