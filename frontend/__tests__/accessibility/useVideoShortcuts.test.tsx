import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { I18nProvider } from "@/contexts/I18nContext";
import {
  A11yProvider,
  useA11y,
} from "@/components/student/accessibility/A11yContext";
import { useVideoShortcuts } from "@/components/student/accessibility/useVideoShortcuts";

const wrap = ({ children }: { children: React.ReactNode }) => (
  <I18nProvider>
    <A11yProvider>{children}</A11yProvider>
  </I18nProvider>
);

interface VideoStub extends Partial<HTMLVideoElement> {
  paused: boolean;
  currentTime: number;
  duration: number;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  requestFullscreen?: ReturnType<typeof vi.fn>;
}

function mountVideoStub(): VideoStub {
  const v = document.createElement("video") as HTMLVideoElement & VideoStub;
  v.play = vi.fn().mockResolvedValue(undefined) as VideoStub["play"];
  v.pause = vi.fn();
  v.requestFullscreen = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(v, "paused", {
    value: true,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(v, "duration", {
    value: 600,
    writable: true,
    configurable: true,
  });
  v.currentTime = 100;
  document.body.appendChild(v);
  return v as VideoStub;
}

beforeEach(() => {
  // 깨끗한 DOM 으로 시작
  document.body.querySelectorAll("video").forEach((v) => v.remove());
  window.sessionStorage.clear();
});

afterEach(() => {
  document.body.querySelectorAll("video").forEach((v) => v.remove());
});

function fireKey(key: string) {
  const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  document.dispatchEvent(ev);
}

describe("useVideoShortcuts", () => {
  it("Space toggles play/pause on the first video element", () => {
    const v = mountVideoStub();
    renderHook(() => useVideoShortcuts(), { wrapper: wrap });
    act(() => fireKey(" "));
    expect(v.play).toHaveBeenCalled();
    Object.defineProperty(v, "paused", { value: false, configurable: true });
    act(() => fireKey(" "));
    expect(v.pause).toHaveBeenCalled();
  });

  it("ArrowLeft / ArrowRight skip 10 seconds (clamped to [0, duration])", () => {
    const v = mountVideoStub();
    v.currentTime = 100;
    renderHook(() => useVideoShortcuts(), { wrapper: wrap });
    act(() => fireKey("ArrowLeft"));
    expect(v.currentTime).toBe(90);
    act(() => fireKey("ArrowRight"));
    expect(v.currentTime).toBe(100);
    // 0 이하로 가지 않음
    v.currentTime = 5;
    act(() => fireKey("ArrowLeft"));
    expect(v.currentTime).toBe(0);
  });

  it("F triggers requestFullscreen (or exit when in fullscreen)", () => {
    const v = mountVideoStub();
    renderHook(() => useVideoShortcuts(), { wrapper: wrap });
    act(() => fireKey("f"));
    expect(v.requestFullscreen).toHaveBeenCalled();
  });

  it("C toggles a11y captions state", () => {
    mountVideoStub();
    // react-hooks/globals 룰 회피: `let snap` 외부 변수를 component 본문에서
    // 직접 reassign 하면 룰 위반. 대신 mutable container object 의 .current
    // 를 mutation 하면 reassignment 가 아니라 OK (ref-style snapshot).
    const snapRef: { current: ReturnType<typeof useA11y> | null } = { current: null };
    function Spy() {
      snapRef.current = useA11y();
      useVideoShortcuts();
      return null;
    }
    renderHook(() => Spy(), { wrapper: wrap });
    expect(snapRef.current!.captions).toBe(false);
    act(() => fireKey("c"));
    expect(snapRef.current!.captions).toBe(true);
    act(() => fireKey("c"));
    expect(snapRef.current!.captions).toBe(false);
  });

  it("? key invokes onShowHelp callback", () => {
    mountVideoStub();
    const onShow = vi.fn();
    renderHook(() => useVideoShortcuts({ onShowHelp: onShow }), { wrapper: wrap });
    act(() => fireKey("?"));
    expect(onShow).toHaveBeenCalledOnce();
  });

  it("does NOT trigger when focus is in an input field (Q&A protection)", () => {
    const v = mountVideoStub();
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    renderHook(() => useVideoShortcuts(), { wrapper: wrap });
    // Dispatch directly on the input element so target is the input
    input.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    expect(v.play).not.toHaveBeenCalled();
    expect(v.pause).not.toHaveBeenCalled();
    input.remove();
  });

  it("ignores combinations with modifier keys", () => {
    const v = mountVideoStub();
    renderHook(() => useVideoShortcuts(), { wrapper: wrap });
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", ctrlKey: true, bubbles: true }),
    );
    expect(v.play).not.toHaveBeenCalled();
  });
});
