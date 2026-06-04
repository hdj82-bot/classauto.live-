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

beforeEach(() => {
  apiGet.mockReset();
  apiPost.mockReset();
});

describe("AvatarScriptTest", () => {
  it("음성이 없으면 아무것도 렌더하지 않는다", () => {
    const { container } = render(
      <AvatarScriptTest look={customLook()} voiceId={null} reducedMotion t={t} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("표준(비-custom) 아바타면 렌더하지 않는다", () => {
    const { container } = render(
      <AvatarScriptTest
        look={customLook({ is_custom: false })}
        voiceId="v1"
        reducedMotion
        t={t}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("본인 룩 + 음성이면 '말하기' 시 준비 훅 호출 후 대본·음성으로 렌더한다", async () => {
    const onPrepareRender = vi.fn().mockResolvedValue(undefined);
    apiPost.mockResolvedValue({
      data: { status: "ready", video_url: "https://x/talk.mp4", voice_id: "v1" },
    });

    render(
      <AvatarScriptTest
        look={customLook()}
        voiceId="v1"
        voiceName="내 목소리"
        onPrepareRender={onPrepareRender}
        reducedMotion
        t={t}
      />,
    );

    fireEvent.click(screen.getByTestId("script-test-speak"));

    // 렌더 직전 준비(기본 룩 지정) 훅이 먼저 호출된다.
    await waitFor(() => expect(onPrepareRender).toHaveBeenCalledTimes(1));
    // me/preview 에 선택 음성 + 비어있지 않은 대본을 보낸다.
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    const [url, body] = apiPost.mock.calls[0];
    expect(url).toBe("/api/avatars/me/preview");
    expect((body as { voice_id: string }).voice_id).toBe("v1");
    expect(typeof (body as { text: string }).text).toBe("string");
    expect((body as { text: string }).text.length).toBeGreaterThan(0);

    // 완료되면 말하는 영상이 노출된다.
    await waitFor(() =>
      expect(
        document.querySelector('video[src="https://x/talk.mp4"]'),
      ).toBeTruthy(),
    );
  });
});
