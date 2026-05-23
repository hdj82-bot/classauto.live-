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
// /api/voices 도 throw → 음성 합성 폴백 목록 사용.
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

  it("maps backend wire shape ({avatars,total} + avatar_id/name) to cards", async () => {
    // 창1(#212) 실제 200 응답 — snake_case 래퍼. avatarsApi 어댑터가
    // avatar_id→id 로 매핑해야 카드 testid(avatar-card-{id})가 생성된다.
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
              {
                avatar_id: "av_f1",
                avatar_name: "Anna",
                gender: "female",
                preview_image_url: "https://x/f.png",
                preview_video_url: "https://x/f.mp4",
                is_custom: false,
              },
            ],
            total: 2,
          },
        };
      }
      throw new Error(`unhandled GET ${url}`);
    });

    renderPage(<AvatarsPage />);

    await waitFor(() =>
      expect(screen.getByTestId("avatar-card-av_m1")).toBeTruthy(),
    );
    expect(screen.getByTestId("avatar-card-av_f1")).toBeTruthy();
    // 정상 200 → fixture 폴백 배너는 뜨지 않는다.
    expect(screen.queryByTestId("avatars-deferred-banner")).toBeNull();
  });

  it("loads the real /api/voices catalog into the preview stage", async () => {
    // /api/avatars 는 fixture, /api/voices 는 실제 ElevenLabs 카탈로그 반환.
    apiGet.mockImplementation(async (url: string) => {
      if (url === "/api/avatars") {
        throw Object.assign(new Error("nf"), { response: { status: 404 } });
      }
      if (url === "/api/voices") {
        return {
          data: {
            voices: [
              {
                voice_id: "v_lily",
                name: "Lily",
                display_name: "Lily",
                gender: "female",
                gender_ko: "여성",
                accent_ko: "영국",
                description_ko: "부드러운 목소리",
                preview_url: "https://x/lily.mp3",
              },
              {
                voice_id: "v_adam",
                name: "Adam",
                display_name: "Adam",
                gender: "male",
                gender_ko: "남성",
                accent_ko: "미국",
                preview_url: "https://x/adam.mp3",
              },
            ],
            total: 2,
          },
        };
      }
      throw new Error(`unhandled GET ${url}`);
    });

    renderPage(<AvatarsPage />);

    // 백엔드 음성 카탈로그가 무대 음성 목록으로 렌더된다.
    await waitFor(() =>
      expect(screen.getByTestId("avatar-voice-option-v_lily")).toBeTruthy(),
    );
    expect(screen.getByTestId("avatar-voice-option-v_adam")).toBeTruthy();
  });

  it("offers a 'generate moving preview' action for the custom avatar", async () => {
    apiGet.mockImplementation(async (url: string) => {
      if (url === "/api/avatars") {
        return {
          data: {
            avatars: [
              {
                avatar_id: "tp_self",
                avatar_name: "하두진 (본인)",
                is_custom: true,
                preview_image_url: "https://x/me.png",
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
              { voice_id: "v1", name: "Adam", gender: "male", preview_url: "https://x/a.mp3" },
            ],
            total: 1,
          },
        };
      }
      if (url === "/api/avatars/me/preview") {
        // 아직 만들지 않음 → 생성 버튼 노출.
        return { data: { status: "not_started" } };
      }
      throw new Error(`unhandled GET ${url}`);
    });
    apiPost.mockResolvedValue({ data: { status: "processing" } });

    renderPage(<AvatarsPage />);

    // 본인 아바타는 업로드 카드 우측에 노출 → 클릭해 무대에서 선택.
    const customBtn = await screen.findByTestId("upload-custom-avatar");
    fireEvent.click(customBtn);

    // 사진 기반이라 '움직이는 미리보기 만들기' 버튼이 떠야 한다.
    const genBtn = await screen.findByTestId("avatar-preview-generate");
    fireEvent.click(genBtn);

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith(
        "/api/avatars/me/preview",
        expect.objectContaining({ force: false }),
        undefined,
      ),
    );
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
