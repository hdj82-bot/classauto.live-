import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  renderHook,
  act,
} from "@testing-library/react";
import LookGenerateStep from "@/components/professor/avatars/onboarding/LookGenerateStep";
import LookSelectStep from "@/components/professor/avatars/onboarding/LookSelectStep";
import { LOOK_PRESETS } from "@/components/professor/avatars/onboarding/lookPresets";
import type { Look } from "@/components/professor/avatars/onboarding/photoAvatarTypes";

// 컴포넌트는 i18n provider 없이 t 를 prop 으로 받는다 — 키를 그대로 돌려주는
// 가짜 t 로 동작을 검증한다(프리셋 프롬프트 = promptKey 문자열).
const t = (key: string) => key;

const readyLook = (id: string): Look => ({
  look_id: id,
  preview_image_url: "data:image/svg+xml;utf8,x",
  prompt: "p",
  status: "ready",
});

describe("LookGenerateStep — 스타일 샘플 갤러리", () => {
  it("프리셋마다 샘플 카드를 렌더한다", () => {
    render(
      <LookGenerateStep
        looks={[]}
        onGenerate={vi.fn()}
        looksPending={false}
        reducedMotion={false}
        onNext={vi.fn()}
        onRestart={vi.fn()}
        t={t}
      />,
    );
    expect(screen.getByTestId("look-preset-gallery")).toBeTruthy();
    for (const p of LOOK_PRESETS) {
      expect(screen.getByTestId(`look-preset-${p.id}`)).toBeTruthy();
    }
    // 자유 입력 textarea 는 보조로 유지된다.
    expect(screen.getByTestId("look-prompt")).toBeTruthy();
  });

  it("카드 클릭 시 프롬프트가 채워지고 바로 생성되며 선택이 강조된다", async () => {
    const onGenerate = vi.fn().mockResolvedValue(undefined);
    render(
      <LookGenerateStep
        looks={[]}
        onGenerate={onGenerate}
        looksPending={false}
        reducedMotion={false}
        onNext={vi.fn()}
        onRestart={vi.fn()}
        t={t}
      />,
    );
    const first = LOOK_PRESETS[0];
    fireEvent.click(screen.getByTestId(`look-preset-${first.id}`));

    await waitFor(() => expect(onGenerate).toHaveBeenCalledTimes(1));
    // 프리셋 프롬프트(가짜 t → promptKey)로 즉시 생성.
    expect(onGenerate).toHaveBeenCalledWith(first.promptKey, expect.any(Number));
    // textarea 에도 채워진다.
    expect((screen.getByTestId("look-prompt") as HTMLTextAreaElement).value).toBe(
      first.promptKey,
    );
    // 선택 강조(aria-pressed).
    expect(
      screen.getByTestId(`look-preset-${first.id}`).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("누적 한도에 도달하면 카드가 비활성화되고 생성되지 않는다", () => {
    const looks = Array.from({ length: 12 }, (_, i) => readyLook(`l${i}`));
    const onGenerate = vi.fn();
    render(
      <LookGenerateStep
        looks={looks}
        onGenerate={onGenerate}
        looksPending={false}
        reducedMotion={false}
        onNext={vi.fn()}
        onRestart={vi.fn()}
        t={t}
      />,
    );
    const card = screen.getByTestId(
      `look-preset-${LOOK_PRESETS[0].id}`,
    ) as HTMLButtonElement;
    expect(card.disabled).toBe(true);
    fireEvent.click(card);
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it("생성 단계에서 '다른 사진으로 다시 시작' 동선을 제공한다", () => {
    const onRestart = vi.fn();
    render(
      <LookGenerateStep
        looks={[]}
        onGenerate={vi.fn()}
        looksPending={false}
        reducedMotion={false}
        onNext={vi.fn()}
        onRestart={onRestart}
        t={t}
      />,
    );
    fireEvent.click(screen.getByTestId("generate-restart"));
    expect(onRestart).toHaveBeenCalledTimes(1);
  });
});

describe("LookSelectStep — 복귀 동선", () => {
  it("선택 단계에서 '다른 사진으로 다시 시작' 동선을 제공한다", () => {
    const onRestart = vi.fn();
    render(
      <LookSelectStep
        looks={[readyLook("a")]}
        selectedLookId={null}
        onSelect={vi.fn()}
        reducedMotion={false}
        onBack={vi.fn()}
        onRestart={onRestart}
        onNext={vi.fn()}
        t={t}
      />,
    );
    fireEvent.click(screen.getByTestId("select-restart"));
    expect(onRestart).toHaveBeenCalledTimes(1);
  });
});

// usePhotoAvatarFlow.goTo("upload") 가 stale 룩/선택을 비우는지 검증.
vi.mock("@/components/professor/avatars/onboarding/photoAvatarApi", () => ({
  getPhotoAvatar: vi.fn().mockResolvedValue({ group_id: null, status: "none" }),
  listLooks: vi
    .fn()
    .mockResolvedValue([
      { look_id: "k1", preview_image_url: "x", prompt: "p", status: "ready" },
    ]),
  generateLooks: vi.fn().mockResolvedValue({ generation_id: "g" }),
  selectLook: vi.fn().mockResolvedValue({ ok: true }),
  uploadPhotoAvatar: vi.fn(),
  isDeferredMode: vi.fn().mockReturnValue(false),
}));

import { usePhotoAvatarFlow } from "@/components/professor/avatars/onboarding/usePhotoAvatarFlow";

describe("usePhotoAvatarFlow — 업로드 복귀 시 stale 룩 초기화", () => {
  beforeEach(() => vi.clearAllMocks());

  it("goTo('upload') 는 looks/selectedLookId 를 비운다", async () => {
    const { result, unmount } = renderHook(() => usePhotoAvatarFlow());
    await waitFor(() => expect(result.current.initializing).toBe(false));

    // 룩 생성 → looks 채움 + 선택.
    await act(async () => {
      await result.current.generate("프롬프트", 2);
    });
    await act(async () => {
      await result.current.select("k1");
    });
    expect(result.current.looks.length).toBeGreaterThan(0);
    expect(result.current.selectedLookId).toBe("k1");

    // 다른 사진으로 다시 시작 → stale 룩/선택이 남지 않아야 한다.
    act(() => result.current.goTo("upload"));
    expect(result.current.step).toBe("upload");
    expect(result.current.looks).toHaveLength(0);
    expect(result.current.selectedLookId).toBeNull();

    unmount();
  });
});
