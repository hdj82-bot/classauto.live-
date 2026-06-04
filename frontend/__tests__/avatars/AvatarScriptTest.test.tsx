import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Avatar } from "@/components/professor/avatars/avatarsTypes";
import AvatarScriptTest from "@/components/professor/avatars/AvatarScriptTest";

const t = (key: string) => key;

const apiGet = vi.fn();
const apiPost = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    get: (url: string, opts?: unknown) => apiGet(url, opts),
    post: (url: string, body: unknown, opts?: unknown) => apiPost(url, body, opts),
  },
}));

const customLook = (over: Partial<Avatar> = {}): Avatar => ({
  id: "look-1",
  name: "내 룩",
  preview_image_url: "https://x/look1.png",
  preview_video_url: null,
  is_custom: true,
  status: "ready",
  ...over,
});

// 새 작업대 props 기본값(active/renderNonce/적용 관련).
const base = {
  voiceId: "v1" as string | null,
  voiceName: "내 목소리",
  active: true,
  renderNonce: 0,
  lectureId: "lec-1" as string | null,
  applying: false,
  onApplyToLecture: vi.fn(),
  reducedMotion: true,
  t,
};

beforeEach(() => {
  apiGet.mockReset();
  apiPost.mockReset();
  base.onApplyToLecture = vi.fn();
});

describe("AvatarScriptTest (아바타 제작 작업대)", () => {
  it("작업대가 닫혀 있으면(active=false) 아무것도 렌더하지 않는다", () => {
    const { container } = render(
      <AvatarScriptTest {...base} look={customLook()} active={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("음성이 없으면 렌더하지 않는다", () => {
    const { container } = render(
      <AvatarScriptTest {...base} look={customLook()} voiceId={null} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("표준(비-custom) 아바타면 렌더하지 않는다", () => {
    const { container } = render(
      <AvatarScriptTest {...base} look={customLook({ is_custom: false })} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("제작(renderNonce 증가) 시 준비 훅 호출 후 대본·음성으로 렌더한다", async () => {
    const onPrepareRender = vi.fn().mockResolvedValue(undefined);
    apiPost.mockResolvedValue({
      data: { status: "ready", video_url: "https://x/talk.mp4", voice_id: "v1" },
    });

    // renderNonce=1 로 마운트 → 작업대가 열리며 자동 렌더.
    render(
      <AvatarScriptTest
        {...base}
        look={customLook()}
        renderNonce={1}
        onPrepareRender={onPrepareRender}
      />,
    );

    await waitFor(() => expect(onPrepareRender).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    const [url, body] = apiPost.mock.calls[0];
    expect(url).toBe("/api/avatars/me/preview");
    expect((body as { voice_id: string }).voice_id).toBe("v1");
    expect((body as { text: string }).text.length).toBeGreaterThan(0);

    await waitFor(() =>
      expect(
        document.querySelector('video[src="https://x/talk.mp4"]'),
      ).toBeTruthy(),
    );
  });

  it("렌더 완료 전엔 '강의에 적용'이 비활성, 완료 후 누르면 onApplyToLecture 호출", async () => {
    apiPost.mockResolvedValue({
      data: { status: "ready", video_url: "https://x/talk.mp4", voice_id: "v1" },
    });
    render(
      <AvatarScriptTest {...base} look={customLook()} renderNonce={1} />,
    );

    const applyBtn = (await screen.findByTestId("build-apply")) as HTMLButtonElement;
    // 렌더가 끝나(ready) 영상이 뜨면 활성화된다.
    await waitFor(() =>
      expect(
        document.querySelector('video[src="https://x/talk.mp4"]'),
      ).toBeTruthy(),
    );
    await waitFor(() => expect(applyBtn.disabled).toBe(false));
    fireEvent.click(applyBtn);
    expect(base.onApplyToLecture).toHaveBeenCalledTimes(1);
  });
});
