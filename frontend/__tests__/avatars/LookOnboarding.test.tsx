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
import {
  LOOK_BATCH_DEFAULT,
  LOOK_TOTAL_MAX,
  type Look,
} from "@/components/professor/avatars/onboarding/photoAvatarTypes";

// 컴포넌트는 i18n provider 없이 t 를 prop 으로 받는다 — 키를 그대로 돌려주는
// 가짜 t 로 동작을 검증한다(옵션 라벨은 lookOptions 데이터에 한국어로 있음).
const t = (key: string) => key;

const readyLook = (id: string): Look => ({
  look_id: id,
  image_url: "data:image/svg+xml;utf8,x",
  preview_image_url: null,
  prompt: "p",
  status: "ready",
});

describe("LookGenerateStep — 구조화 옵션 폼 (v0.2)", () => {
  it("자유 프롬프트 갤러리 대신 옵션 폼을 렌더한다", () => {
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
    expect(screen.getByTestId("look-option-form")).toBeTruthy();
    // v0.1 프리셋 갤러리·자유 입력은 제거됐다.
    expect(screen.queryByTestId("look-preset-gallery")).toBeNull();
    expect(screen.queryByTestId("look-prompt")).toBeNull();
  });

  it("'룩 생성' 클릭 시 기본 persona 추천 조합으로 구조화 입력을 전달한다", async () => {
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
    fireEvent.click(screen.getByTestId("look-generate-btn"));

    await waitFor(() => expect(onGenerate).toHaveBeenCalledTimes(1));
    // 기본 educator + 추천 조합(blazer/lecture/friendly), extra 없음.
    expect(onGenerate).toHaveBeenCalledWith({
      persona: "educator",
      outfit: "blazer",
      background: "lecture",
      expression: "friendly",
      extra: null,
    });
  });

  it("누적 한도에 도달하면 생성 버튼 대신 소프트 안내를 노출한다", () => {
    const looks = Array.from({ length: LOOK_TOTAL_MAX }, (_, i) => readyLook(`l${i}`));
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
    expect(screen.queryByTestId("look-generate-btn")).toBeNull();
    expect(screen.getByTestId("look-cap-note")).toBeTruthy();
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
// v0.2: 그룹은 즉시 ready, 룩 생성은 구조화 입력 + 배치(LOOK_BATCH_DEFAULT).
vi.mock("@/components/professor/avatars/onboarding/photoAvatarApi", () => ({
  getPhotoAvatar: vi.fn().mockResolvedValue({ group_id: null, status: "none" }),
  listLooks: vi
    .fn()
    .mockResolvedValue([
      { look_id: "k1", image_url: "x", preview_image_url: null, prompt: "p", status: "ready" },
    ]),
  generateLooks: vi.fn().mockResolvedValue({ generation_id: "g" }),
  selectLook: vi.fn().mockResolvedValue({ ok: true }),
  uploadPhotoAvatar: vi.fn(),
  isDeferredMode: vi.fn().mockReturnValue(false),
}));

import { usePhotoAvatarFlow } from "@/components/professor/avatars/onboarding/usePhotoAvatarFlow";
import { generateLooks } from "@/components/professor/avatars/onboarding/photoAvatarApi";

describe("usePhotoAvatarFlow — 업로드 복귀 시 stale 룩 초기화", () => {
  beforeEach(() => vi.clearAllMocks());

  it("goTo('upload') 는 looks/selectedLookId 를 비운다", async () => {
    const { result, unmount } = renderHook(() => usePhotoAvatarFlow());
    await waitFor(() => expect(result.current.initializing).toBe(false));

    // 룩 생성 → 구조화 입력으로 배치(LOOK_BATCH_DEFAULT 장) 생성.
    const input = {
      persona: "educator" as const,
      outfit: "blazer" as const,
      background: "lecture" as const,
      expression: "friendly" as const,
      extra: null,
    };
    await act(async () => {
      await result.current.generate(input);
    });
    expect(generateLooks).toHaveBeenCalledWith(input, LOOK_BATCH_DEFAULT);
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
