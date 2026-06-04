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
  it("shows the sample voice picker (fallback) and drops the sample avatar gallery", async () => {
    mockDeferredBackend();
    renderPage(<AvatarsPage />);

    await waitFor(() =>
      expect(screen.getByTestId("avatars-page")).toBeTruthy(),
    );

    // 백엔드 미배포 → fixture 미리보기 배너.
    expect(screen.getByTestId("avatars-deferred-banner")).toBeTruthy();
    // 샘플 HeyGen 아바타 갤러리(성별 섹션)는 제거됨.
    expect(screen.queryByTestId("avatars-section-male")).toBeNull();
    expect(screen.queryByTestId("avatars-section-female")).toBeNull();
    // 대신 "샘플 목소리 선택" 박스가 합성 폴백 보이스로 렌더된다.
    await waitFor(() =>
      expect(screen.getByTestId("sample-voice-picker")).toBeTruthy(),
    );
    expect(
      screen.getByTestId("sample-voice-option-tts-ko-male-jihun"),
    ).toBeTruthy();

    // 빌더 바는 항상 노출되지만, 강의 컨텍스트가 없으면 제작 버튼은 비활성.
    const createBtn = screen.getByTestId("avatars-apply") as HTMLButtonElement;
    expect(createBtn.disabled).toBe(true);
  });

  it("maps backend wire shape ({avatars,total} + avatar_id/name) to library cards", async () => {
    // 창1(#212) 실제 200 응답 — snake_case 래퍼. avatarsApi 어댑터가
    // avatar_id→id 로 매핑해야 카드 testid(avatar-card-{id})가 생성된다.
    // 본인 아바타(is_custom)는 "저장된 아바타·룩 라이브러리" 그리드로 노출된다.
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
                is_custom: true,
              },
              {
                avatar_id: "av_f1",
                avatar_name: "Anna",
                gender: "female",
                preview_image_url: "https://x/f.png",
                preview_video_url: "https://x/f.mp4",
                is_custom: true,
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

  it("loads the real /api/voices catalog into the sample voice picker", async () => {
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

    // 백엔드 음성 카탈로그가 "샘플 목소리 선택" 목록으로 렌더된다.
    await waitFor(() =>
      expect(screen.getByTestId("sample-voice-option-v_lily")).toBeTruthy(),
    );
    expect(screen.getByTestId("sample-voice-option-v_adam")).toBeTruthy();
  });

  it("embeds the Design-with-AI looks onboarding inline (photo upload step in card)", async () => {
    mockDeferredBackend();
    renderPage(<AvatarsPage />);

    // 별도 /onboarding 라우트로 보내지 않고, 카드 안에서 사진 업로드 단계부터 시작.
    await waitFor(() =>
      expect(screen.getByTestId("photo-avatar-studio")).toBeTruthy(),
    );
    expect(screen.getByTestId("studio-stepper")).toBeTruthy();
    expect(screen.getByTestId("step-upload")).toBeTruthy();
    // 라우팅이 일어나지 않아야 한다(인라인 임베드).
    expect(push).not.toHaveBeenCalled();
  });

  it("fetches a recording script (mock fallback) and shows it in the voice card", async () => {
    mockDeferredBackend(); // 모든 POST 미정의 → requestVoiceScript 가 mock 대본으로 폴백
    renderPage(<AvatarsPage />);

    const scriptBtn = await screen.findByTestId("script-get");
    fireEvent.click(scriptBtn);

    // ~500자 학술 대본 박스가 표시된다(미배포 → 예시 대본).
    await waitFor(() =>
      expect(screen.getByTestId("script-box")).toBeTruthy(),
    );
  });

  it("renames the page to 'Q&A 아바타 선택' and the voice load button", async () => {
    mockDeferredBackend();
    renderPage(<AvatarsPage />);

    await waitFor(() =>
      expect(screen.getByTestId("avatars-page")).toBeTruthy(),
    );
    // 1) 페이지 제목.
    expect(screen.getByText("Q&A 아바타 선택")).toBeTruthy();
    // 3) 중앙 버튼 "음성 파일 불러오기".
    const pick = screen.getByTestId("voice-clone-pick");
    expect(pick.textContent).toContain("음성 파일 불러오기");
    // 4) 우측으로 옮긴 "마이크로 직접 녹음하기" 라벨.
    expect(screen.getByTestId("record-start").textContent).toContain(
      "마이크로 직접 녹음하기",
    );
  });

  it("offers a recording-script language selector (ko/en/zh/ja)", async () => {
    mockDeferredBackend();
    renderPage(<AvatarsPage />);

    const langSelect = (await screen.findByTestId(
      "script-lang",
    )) as HTMLSelectElement;
    const values = Array.from(langSelect.options).map((o) => o.value);
    expect(values).toEqual(["ko", "en", "zh", "ja"]);
  });

  it("creates the Q&A avatar (selected look) for the lecture and returns to studio", async () => {
    // 라이브러리에 본인 룩(is_custom) 1개. 룩을 골라 "룩과 목소리 아바타 제작".
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
      throw new Error(`unhandled GET ${url}`);
    });
    apiPatch.mockResolvedValue({ data: {} });
    apiPost.mockResolvedValue({ data: {} });
    search = new URLSearchParams("lecture=lec-1");

    renderPage(<AvatarsPage />);

    // 라이브러리 그리드에 본인 룩 카드가 노출된다.
    const card = await screen.findByTestId("avatar-card-look_1");

    // 제작 버튼은 선택 전에는 비활성.
    const applyBtn = screen.getByTestId("avatars-apply") as HTMLButtonElement;
    expect(applyBtn.disabled).toBe(true);

    // 룩 선택 → 제작 버튼 활성화 (카드 선택 버튼은 testid div 안의 유일 버튼).
    fireEvent.click(within(card).getByRole("button"));
    await waitFor(() => expect(applyBtn.disabled).toBe(false));

    fireEvent.click(applyBtn);

    // 음성을 따로 고르지 않았으면 voice_id 는 건드리지 않고 룩만 적용한다.
    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith("/api/lectures/lec-1", {
        avatar_id: "look_1",
      }),
    );
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/professor/studio/lec-1"),
    );
  });

  it("applies the chosen sample voice (voice_id) together with the look", async () => {
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
      throw new Error(`unhandled GET ${url}`);
    });
    apiPatch.mockResolvedValue({ data: {} });
    apiPost.mockResolvedValue({ data: {} });
    search = new URLSearchParams("lecture=lec-1");

    renderPage(<AvatarsPage />);

    // 룩 선택.
    const card = await screen.findByTestId("avatar-card-look_1");
    fireEvent.click(within(card).getByRole("button"));

    // 샘플 보이스 "이 음성을 아바타 제작에 사용" 버튼 클릭.
    const useBtn = await screen.findByTestId("sample-voice-use-v_adam");
    fireEvent.click(useBtn);

    const applyBtn = screen.getByTestId("avatars-apply") as HTMLButtonElement;
    await waitFor(() => expect(applyBtn.disabled).toBe(false));
    fireEvent.click(applyBtn);

    // 룩(avatar_id) + 음성(voice_id) 두 번 PATCH.
    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith("/api/lectures/lec-1", {
        avatar_id: "look_1",
      }),
    );
    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith("/api/lectures/lec-1", {
        voice_id: "v_adam",
      }),
    );
  });

  it("makes own-voice and sample-voice 'use' buttons mutually exclusive", async () => {
    apiGet.mockImplementation(async (url: string) => {
      if (url === "/api/avatars") {
        throw Object.assign(new Error("nf"), { response: { status: 404 } });
      }
      if (url === "/api/avatars/me/voice") {
        return { data: { status: "ready", voice_id: "my_clone", name: "내 음성" } };
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
      throw new Error(`unhandled GET ${url}`);
    });

    renderPage(<AvatarsPage />);

    // 본인 음성 박스의 "사용" 토글 + 샘플 보이스의 "사용" 토글.
    const ownUse = await screen.findByTestId("voice-clone-use");
    const sampleUse = await screen.findByTestId("sample-voice-use-v_adam");

    // 본인 클론 음성(my_clone)은 샘플 목록에서 제외된다(위 박스와 중복).
    expect(screen.queryByTestId("sample-voice-use-my_clone")).toBeNull();

    // 처음엔 둘 다 비활성.
    expect(ownUse.getAttribute("aria-pressed")).toBe("false");
    expect(sampleUse.getAttribute("aria-pressed")).toBe("false");

    // 본인 음성 사용 → 본인만 활성.
    fireEvent.click(ownUse);
    await waitFor(() => expect(ownUse.getAttribute("aria-pressed")).toBe("true"));
    expect(sampleUse.getAttribute("aria-pressed")).toBe("false");

    // 샘플 사용 클릭 → 본인은 자동 해제, 샘플만 활성(상호 배타).
    fireEvent.click(sampleUse);
    await waitFor(() => expect(sampleUse.getAttribute("aria-pressed")).toBe("true"));
    expect(ownUse.getAttribute("aria-pressed")).toBe("false");

    // 활성 버튼 재클릭 → 해제(취소).
    fireEvent.click(sampleUse);
    await waitFor(() => expect(sampleUse.getAttribute("aria-pressed")).toBe("false"));
  });
});
