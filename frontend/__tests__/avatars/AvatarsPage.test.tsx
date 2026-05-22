import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "@/contexts/I18nContext";
import { ToastProvider } from "@/components/ui/Toast";

const apiGet = vi.fn();
const apiPatch = vi.fn();
const apiPost = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    get: (url: string, opts?: unknown) => apiGet(url, opts),
    patch: (url: string, body: unknown) => apiPatch(url, body),
    post: (url: string, body: unknown, opts?: unknown) =>
      apiPost(url, body, opts),
  },
}));

const push = vi.fn();
let search = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => search,
  usePathname: () => "/professor/avatars",
}));

import AvatarsPage from "@/app/professor/avatars/page";

const renderPage = (ui: ReactNode) =>
  render(
    <I18nProvider>
      <ToastProvider>{ui}</ToastProvider>
    </I18nProvider>,
  );

// /api/avatars 가 미배포(404) → avatarsApi 가 fixture(deferred) 로 폴백.
function mockDeferredBackend() {
  apiGet.mockImplementation(async (url: string) => {
    if (url === "/api/avatars") {
      throw Object.assign(new Error("nf"), { response: { status: 404 } });
    }
    throw new Error(`unhandled GET ${url}`);
  });
}

beforeEach(() => {
  apiGet.mockReset();
  apiPatch.mockReset();
  apiPost.mockReset();
  push.mockReset();
  search = new URLSearchParams();
});

describe("AvatarsPage", () => {
  it("renders gender sections from fixture data with a deferred banner", async () => {
    mockDeferredBackend();
    renderPage(<AvatarsPage />);

    await waitFor(() =>
      expect(screen.getByTestId("avatars-page")).toBeTruthy(),
    );

    // 백엔드 미배포 → fixture 미리보기 배너.
    expect(screen.getByTestId("avatars-deferred-banner")).toBeTruthy();
    // 성별 섹션이 그룹핑되어 노출.
    expect(screen.getByTestId("avatars-section-male")).toBeTruthy();
    expect(screen.getByTestId("avatars-section-female")).toBeTruthy();
    // fixture 카드가 마운트.
    expect(screen.getByTestId("avatar-card-heygen-male-01")).toBeTruthy();
    expect(screen.getByTestId("avatar-card-heygen-female-01")).toBeTruthy();

    // 강의 컨텍스트가 없으면 적용 버튼은 없고 안내만 노출.
    expect(screen.queryByTestId("avatars-apply")).toBeNull();
  });

  it("applies the selected avatar to the lecture and returns to studio", async () => {
    mockDeferredBackend();
    apiPatch.mockResolvedValue({ data: {} });
    search = new URLSearchParams("lecture=lec-1");

    renderPage(<AvatarsPage />);

    await waitFor(() =>
      expect(screen.getByTestId("avatar-card-heygen-male-01")).toBeTruthy(),
    );

    // 적용 버튼은 선택 전에는 비활성.
    const applyBtn = screen.getByTestId("avatars-apply") as HTMLButtonElement;
    expect(applyBtn.disabled).toBe(true);

    // 아바타 선택 → 적용 버튼 활성화.
    const card = screen.getByTestId("avatar-card-heygen-male-01");
    fireEvent.click(within(card).getByRole("button"));
    await waitFor(() => expect(applyBtn.disabled).toBe(false));

    fireEvent.click(applyBtn);

    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith("/api/lectures/lec-1", {
        avatar_id: "heygen-male-01",
      }),
    );
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/professor/studio/lec-1"),
    );
  });
});
