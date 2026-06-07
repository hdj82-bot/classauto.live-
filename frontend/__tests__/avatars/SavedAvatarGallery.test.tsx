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
import SavedAvatarGallery from "@/components/professor/avatars/SavedAvatarGallery";
import type { SavedAvatar } from "@/components/professor/avatars/avatarsTypes";

const t = (key: string) => key;

const saved = (id: string, over: Partial<SavedAvatar> = {}): SavedAvatar => ({
  id,
  name: id,
  look_id: `look-${id}`,
  voice_id: "v1",
  avatar_scale: 1.0,
  preview_video_url: null,
  preview_status: "none",
  created_at: "2026-01-01T00:00:00Z",
  ...over,
});

// SavedAvatarGallery 의 필수 props 기본값(테스트별로 override).
const baseProps = {
  resolveLookImage: (lookId: string) => `https://x/${lookId}.png`,
  resolveVoiceName: (voiceId: string | null) => (voiceId ? "Adam" : null),
  canApply: true,
  applyingId: null as string | null,
  onApply: vi.fn(),
  onRename: vi.fn(),
  onDelete: vi.fn(),
  onPreview: vi.fn(),
  reducedMotion: true,
  t,
};

beforeEach(() => {
  baseProps.onApply = vi.fn();
  baseProps.onRename = vi.fn();
  baseProps.onDelete = vi.fn();
  baseProps.onPreview = vi.fn();
});

// ── 컴포넌트 단위 ─────────────────────────────────────────────────────────────

describe("SavedAvatarGallery 컴포넌트", () => {
  it("저장된 아바타가 없으면 빈 상태를 보여 준다", () => {
    render(<SavedAvatarGallery {...baseProps} items={[]} />);
    expect(screen.getByTestId("saved-avatar-empty")).toBeTruthy();
    expect(screen.queryByTestId("saved-avatar-grid")).toBeNull();
  });

  it("목록을 카드 그리드로 렌더한다", () => {
    render(
      <SavedAvatarGallery
        {...baseProps}
        items={[saved("a", { name: "강의용 아바타" }), saved("b")]}
      />,
    );
    expect(screen.getByTestId("saved-avatar-grid")).toBeTruthy();
    expect(screen.getByTestId("saved-avatar-card-a")).toBeTruthy();
    expect(screen.getByTestId("saved-avatar-card-b")).toBeTruthy();
    expect(
      within(screen.getByTestId("saved-avatar-card-a")).getByText("강의용 아바타"),
    ).toBeTruthy();
  });

  it("ready 면 루프 영상을, none 이면 '미리보기 만들기' 버튼을, processing 이면 스피너를 표시한다", () => {
    render(
      <SavedAvatarGallery
        {...baseProps}
        items={[
          saved("rdy", {
            preview_status: "ready",
            preview_video_url: "https://x/talk.mp4",
          }),
          saved("non", { preview_status: "none" }),
          saved("proc", { preview_status: "processing" }),
        ]}
      />,
    );
    // ready → 영상.
    const video = screen.getByTestId("saved-avatar-video-rdy") as HTMLVideoElement;
    expect(video.getAttribute("src")).toBe("https://x/talk.mp4");
    // none → 미리보기 생성 버튼.
    expect(screen.getByTestId("saved-avatar-preview-non")).toBeTruthy();
    // processing → 스피너 오버레이 + 영상 없음.
    expect(screen.getByTestId("saved-avatar-processing-proc")).toBeTruthy();
    expect(screen.queryByTestId("saved-avatar-video-proc")).toBeNull();
  });

  it("preview 버튼을 누르면 onPreview 가 호출된다", () => {
    render(
      <SavedAvatarGallery {...baseProps} items={[saved("x", { preview_status: "none" })]} />,
    );
    fireEvent.click(screen.getByTestId("saved-avatar-preview-x"));
    expect(baseProps.onPreview).toHaveBeenCalledWith("x");
  });

  it("강의 컨텍스트가 있으면 '강의에 적용'으로 onApply 를 호출한다", () => {
    render(<SavedAvatarGallery {...baseProps} canApply items={[saved("x")]} />);
    fireEvent.click(screen.getByTestId("saved-avatar-apply-x"));
    expect(baseProps.onApply).toHaveBeenCalledWith("x");
  });

  it("강의 컨텍스트가 없으면 적용 버튼 대신 안내를 보여 준다", () => {
    render(
      <SavedAvatarGallery {...baseProps} canApply={false} items={[saved("x")]} />,
    );
    expect(screen.queryByTestId("saved-avatar-apply-x")).toBeNull();
  });

  it("⋮ 메뉴에서 이름을 변경하면 onRename 이 호출된다", () => {
    render(<SavedAvatarGallery {...baseProps} items={[saved("x", { name: "옛 이름" })]} />);
    fireEvent.click(screen.getByTestId("saved-avatar-menu-x"));
    fireEvent.click(screen.getByTestId("saved-avatar-rename-x"));
    const input = screen.getByTestId("saved-avatar-name-input-x") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "새 이름" } });
    fireEvent.click(screen.getByTestId("saved-avatar-name-save-x"));
    expect(baseProps.onRename).toHaveBeenCalledWith("x", "새 이름");
  });

  it("⋮ 메뉴에서 삭제하면 onDelete 가 호출된다", () => {
    render(<SavedAvatarGallery {...baseProps} items={[saved("x")]} />);
    fireEvent.click(screen.getByTestId("saved-avatar-menu-x"));
    fireEvent.click(screen.getByTestId("saved-avatar-delete-x"));
    expect(baseProps.onDelete).toHaveBeenCalledWith("x");
  });
});

// ── 페이지 통합: 저장·적용 ────────────────────────────────────────────────────

const apiGet = vi.fn();
const apiPatch = vi.fn();
const apiPost = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    get: (url: string, opts?: unknown) => apiGet(url, opts),
    patch: (url: string, body: unknown) => apiPatch(url, body),
    post: (url: string, body: unknown, opts?: unknown) => apiPost(url, body, opts),
    delete: (url: string) => apiPost(url, undefined),
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

beforeEach(() => {
  apiGet.mockReset();
  apiPatch.mockReset();
  apiPost.mockReset();
  push.mockReset();
  search = new URLSearchParams();
});

describe("AvatarsPage — 내 아바타 갤러리", () => {
  it("저장된 아바타 목록을 갤러리 카드로 렌더하고, 미배포 시 빈 상태를 보여 준다", async () => {
    // /api/avatars/me/saved 만 목록 반환, 나머지는 미배포 폴백.
    apiGet.mockImplementation(async (url: string) => {
      if (url === "/api/avatars/me/saved") {
        return {
          data: [
            {
              id: "sa_1",
              name: "사회과학 아바타",
              look_id: "look_1",
              voice_id: "v_adam",
              preview_status: "ready",
              preview_video_url: "https://x/sa1.mp4",
              created_at: "2026-06-01T00:00:00Z",
            },
          ],
        };
      }
      throw Object.assign(new Error("nf"), { response: { status: 404 } });
    });

    renderPage(<AvatarsPage />);

    await waitFor(() =>
      expect(screen.getByTestId("saved-avatar-card-sa_1")).toBeTruthy(),
    );
    expect(screen.getByTestId("saved-avatar-video-sa_1")).toBeTruthy();
  });

  it("스크립트 테스트에서 '이 아바타 저장'을 누르면 룩+음성 조합을 POST 하고 갤러리에 추가한다", async () => {
    apiGet.mockImplementation(async (url: string) => {
      if (url === "/api/avatars") {
        return {
          data: {
            avatars: [
              {
                avatar_id: "look_1",
                avatar_name: "내 룩",
                is_custom: true,
                preview_image_url: "https://x/look.png",
                preview_video_url: null,
              },
            ],
            total: 1,
          },
        };
      }
      if (url === "/api/voices") {
        return {
          data: {
            voices: [
              { voice_id: "v_adam", name: "Adam", gender: "male", preview_url: "https://x/a.mp3" },
            ],
            total: 1,
          },
        };
      }
      if (url === "/api/avatars/me/saved") return { data: [] };
      throw Object.assign(new Error("nf"), { response: { status: 404 } });
    });
    apiPatch.mockResolvedValue({ data: {} });
    apiPost.mockImplementation(async (url: string) => {
      if (url === "/api/avatars/me/preview") {
        return {
          data: { status: "ready", video_url: "https://x/talk.mp4", voice_id: "v_adam" },
        };
      }
      if (url === "/api/avatars/me/saved") {
        return {
          data: {
            id: "sa_new",
            name: "내 룩",
            look_id: "look_1",
            voice_id: "v_adam",
            preview_status: "ready",
            preview_video_url: "https://x/talk.mp4",
            created_at: "2026-06-07T00:00:00Z",
          },
        };
      }
      return { data: {} };
    });
    search = new URLSearchParams("lecture=lec-1");

    renderPage(<AvatarsPage />);

    // 룩 + 음성 선택 → 제작(작업대 렌더) → 영상 ready.
    const card = await screen.findByTestId("avatar-card-look_1");
    fireEvent.click(within(card).getByRole("button"));
    fireEvent.click(await screen.findByTestId("sample-voice-use-v_adam"));
    fireEvent.click(screen.getByTestId("avatars-apply"));

    // 작업대에서 "이 아바타 저장" 클릭.
    const saveBtn = await screen.findByTestId("script-test-save");
    fireEvent.click(saveBtn);

    // 계약된 body 로 POST 한다(preview_video_url 은 제외).
    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith(
        "/api/avatars/me/saved",
        { name: "내 룩", look_id: "look_1", voice_id: "v_adam", avatar_scale: 1.0 },
        undefined,
      ),
    );
    // 저장 결과가 갤러리 카드로 추가된다.
    await waitFor(() =>
      expect(screen.getByTestId("saved-avatar-card-sa_new")).toBeTruthy(),
    );
  });

  it("갤러리에서 '강의에 적용'을 누르면 적용 POST 후 studio 로 복귀한다", async () => {
    apiGet.mockImplementation(async (url: string) => {
      if (url === "/api/avatars/me/saved") {
        return {
          data: [
            {
              id: "sa_1",
              name: "내 아바타",
              look_id: "look_1",
              voice_id: "v_adam",
              preview_status: "none",
              preview_video_url: null,
              created_at: "2026-06-01T00:00:00Z",
            },
          ],
        };
      }
      throw Object.assign(new Error("nf"), { response: { status: 404 } });
    });
    apiPost.mockImplementation(async (url: string) => {
      if (url === "/api/avatars/me/saved/sa_1/apply") return { data: { ok: true } };
      return { data: {} };
    });
    search = new URLSearchParams("lecture=lec-1");

    renderPage(<AvatarsPage />);

    const applyBtn = await screen.findByTestId("saved-avatar-apply-sa_1");
    fireEvent.click(applyBtn);

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith(
        "/api/avatars/me/saved/sa_1/apply",
        { lecture_id: "lec-1" },
        undefined,
      ),
    );
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/professor/studio/lec-1"),
    );
  });

  it("미배포여도 저장(낙관적 추가)이 동작한다 — deferred 시뮬레이션", async () => {
    // 모든 API 404 → 저장 POST 도 deferred 시뮬레이션 성공.
    apiGet.mockImplementation(async (url: string) => {
      if (url === "/api/avatars") {
        return {
          data: {
            avatars: [
              {
                avatar_id: "look_1",
                avatar_name: "내 룩",
                is_custom: true,
                preview_image_url: "https://x/look.png",
              },
            ],
            total: 1,
          },
        };
      }
      if (url === "/api/voices") {
        return {
          data: {
            voices: [
              { voice_id: "v_adam", name: "Adam", gender: "male", preview_url: "https://x/a.mp3" },
            ],
            total: 1,
          },
        };
      }
      throw Object.assign(new Error("nf"), { response: { status: 404 } });
    });
    apiPatch.mockResolvedValue({ data: {} });
    apiPost.mockImplementation(async (url: string) => {
      if (url === "/api/avatars/me/preview") {
        return { data: { status: "ready", video_url: "https://x/talk.mp4", voice_id: "v_adam" } };
      }
      // /api/avatars/me/saved 는 404 → createSavedAvatar 가 시뮬레이션 폴백.
      throw Object.assign(new Error("nf"), { response: { status: 404 } });
    });
    search = new URLSearchParams("lecture=lec-1");

    renderPage(<AvatarsPage />);

    const card = await screen.findByTestId("avatar-card-look_1");
    fireEvent.click(within(card).getByRole("button"));
    fireEvent.click(await screen.findByTestId("sample-voice-use-v_adam"));
    fireEvent.click(screen.getByTestId("avatars-apply"));
    fireEvent.click(await screen.findByTestId("script-test-save"));

    // 백엔드 없이도 갤러리에 카드가 추가되고(시뮬레이션 id 'saved-…'), 그리드가 보인다.
    await waitFor(() =>
      expect(screen.getByTestId("saved-avatar-grid")).toBeTruthy(),
    );
  });
});
