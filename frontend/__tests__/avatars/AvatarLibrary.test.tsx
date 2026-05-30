import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "@/contexts/I18nContext";
import { ToastProvider } from "@/components/ui/Toast";
import AvatarLibrary from "@/components/professor/avatars/AvatarLibrary";
import type { Avatar } from "@/components/professor/avatars/avatarsTypes";

const t = (key: string) => key;

const avatar = (id: string, over: Partial<Avatar> = {}): Avatar => ({
  id,
  name: id,
  preview_image_url: `https://x/${id}.png`,
  preview_video_url: null,
  is_custom: true,
  status: "ready",
  ...over,
});

// ── 컴포넌트 단위 ─────────────────────────────────────────────────────────────

describe("AvatarLibrary 컴포넌트", () => {
  it("만든 아바타·룩이 없고 최근 선택도 없으면 아무것도 렌더하지 않는다", () => {
    const { container } = render(
      <AvatarLibrary
        recent={null}
        items={[]}
        selectedId={null}
        onSelect={vi.fn()}
        onApply={vi.fn()}
        canApply={false}
        applying={false}
        renameEnabled={false}
        onRename={vi.fn()}
        t={t}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("최근 선택 박스를 크게 보여 주고, 적용 가능하면 적용 버튼을 노출한다", () => {
    const onApply = vi.fn();
    render(
      <AvatarLibrary
        recent={avatar("look-1", { name: "네이비 정장" })}
        items={[avatar("look-1", { name: "네이비 정장" })]}
        selectedId="look-1"
        onSelect={vi.fn()}
        onApply={onApply}
        canApply
        applying={false}
        renameEnabled={false}
        onRename={vi.fn()}
        t={t}
      />,
    );
    const box = screen.getByTestId("recent-avatar-box");
    expect(within(box).getByText("네이비 정장")).toBeTruthy();
    const applyBtn = screen.getByTestId("recent-apply");
    fireEvent.click(applyBtn);
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it("강의 컨텍스트가 없으면 적용 버튼 대신 안내를 보여 준다", () => {
    render(
      <AvatarLibrary
        recent={avatar("look-1")}
        items={[avatar("look-1")]}
        selectedId={null}
        onSelect={vi.fn()}
        onApply={vi.fn()}
        canApply={false}
        applying={false}
        renameEnabled={false}
        onRename={vi.fn()}
        t={t}
      />,
    );
    expect(screen.queryByTestId("recent-apply")).toBeNull();
  });

  it("라이브러리 카드를 클릭하면 재생성 없이 즉시 onSelect 가 호출된다", () => {
    const onSelect = vi.fn();
    render(
      <AvatarLibrary
        recent={null}
        items={[avatar("look-1"), avatar("look-2")]}
        selectedId={null}
        onSelect={onSelect}
        onApply={vi.fn()}
        canApply={false}
        applying={false}
        renameEnabled={false}
        onRename={vi.fn()}
        t={t}
      />,
    );
    const card = screen.getByTestId("avatar-card-look-2");
    fireEvent.click(within(card).getByRole("button"));
    expect(onSelect).toHaveBeenCalledWith("look-2");
  });
});

// ── 페이지 통합: 라이브러리·최근 선택 영속화 ──────────────────────────────────

const apiGet = vi.fn();
const apiPatch = vi.fn();
const apiPost = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    get: (url: string, opts?: unknown) => apiGet(url, opts),
    patch: (url: string, body: unknown) => apiPatch(url, body),
    post: (url: string, body: unknown, opts?: unknown) => apiPost(url, body, opts),
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

// 본인 룩 1개 + 그 룩을 최근 선택으로 둔 백엔드.
function mockBackendWithLook() {
  apiGet.mockImplementation(async (url: string) => {
    if (url === "/api/avatars") {
      return {
        data: {
          avatars: [
            {
              avatar_id: "av_m1",
              avatar_name: "James",
              gender: "male",
              preview_image_url: "https://x/m.png",
              preview_video_url: "https://x/m.mp4",
              is_custom: false,
            },
          ],
          total: 1,
        },
      };
    }
    if (url === "/api/avatars/me/looks") {
      return {
        data: [
          {
            look_id: "look-1",
            preview_image_url: "https://x/look1.png",
            prompt: "네이비 정장",
            status: "ready",
            is_default: true,
          },
        ],
      };
    }
    if (url === "/api/avatars/me/recent") {
      return { data: { avatar_id: "look-1" } };
    }
    // voices·voice·preview·lectures 등은 미배포로 폴백.
    throw Object.assign(new Error("nf"), { response: { status: 404 } });
  });
}

beforeEach(() => {
  apiGet.mockReset();
  apiPatch.mockReset();
  apiPost.mockReset();
  push.mockReset();
  search = new URLSearchParams();
});

describe("AvatarsPage — 라이브러리·최근 선택", () => {
  it("저장된 룩을 라이브러리 카드로, 최근 선택을 큰 박스로 복원한다", async () => {
    mockBackendWithLook();
    renderPage(<AvatarsPage />);

    // 라이브러리에 ready 룩 카드가 뜬다.
    await waitFor(() =>
      expect(screen.getByTestId("avatar-card-look-1")).toBeTruthy(),
    );
    expect(screen.getByTestId("avatar-library")).toBeTruthy();
    // 최근 선택 박스가 복원된다(서버 recent_avatar_id = look-1).
    await waitFor(() =>
      expect(screen.getByTestId("recent-avatar-box")).toBeTruthy(),
    );
  });

  it("최근 박스의 '이 강의에 적용'이 재생성 없이 룩을 강의에 적용한다", async () => {
    mockBackendWithLook();
    apiPatch.mockResolvedValue({ data: {} });
    apiPost.mockResolvedValue({ data: { avatar_id: "look-1" } });
    search = new URLSearchParams("lecture=lec-1");

    renderPage(<AvatarsPage />);

    const applyBtn = await screen.findByTestId("recent-apply");
    fireEvent.click(applyBtn);

    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith("/api/lectures/lec-1", {
        avatar_id: "look-1",
      }),
    );
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/professor/studio/lec-1"),
    );
  });

  it("라이브러리에서 룩을 고르면 최근 선택이 서버에 영속화된다", async () => {
    mockBackendWithLook();
    apiPost.mockResolvedValue({ data: { avatar_id: "look-1" } });

    renderPage(<AvatarsPage />);

    const card = await screen.findByTestId("avatar-card-look-1");
    fireEvent.click(within(card).getByRole("button"));

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith(
        "/api/avatars/me/recent",
        { avatar_id: "look-1" },
        undefined,
      ),
    );
  });
});
