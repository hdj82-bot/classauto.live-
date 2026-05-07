import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";

type Listener = () => void;

interface MockMQ {
  matches: boolean;
  media: string;
  listeners: Set<Listener>;
  addEventListener: (event: string, cb: Listener) => void;
  removeEventListener: (event: string, cb: Listener) => void;
  onchange: null;
  dispatchEvent: () => boolean;
}

let mockMQ: MockMQ;

beforeEach(() => {
  mockMQ = {
    matches: false,
    media: "(prefers-reduced-motion: reduce)",
    listeners: new Set<Listener>(),
    addEventListener: (event, cb) => {
      if (event === "change") mockMQ.listeners.add(cb);
    },
    removeEventListener: (event, cb) => {
      if (event === "change") mockMQ.listeners.delete(cb);
    },
    onchange: null,
    dispatchEvent: () => true,
  };
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockReturnValue(mockMQ),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("usePrefersReducedMotion", () => {
  it("OS 가 reduce 미설정이면 false 반환", () => {
    mockMQ.matches = false;
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
  });

  it("OS 가 reduce 설정이면 true 반환", () => {
    mockMQ.matches = true;
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);
  });

  it("런타임 토글 — matchMedia change 이벤트 시 자동 갱신", () => {
    mockMQ.matches = false;
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);

    // 사용자가 OS 설정을 켰다고 가정
    act(() => {
      mockMQ.matches = true;
      mockMQ.listeners.forEach((cb) => cb());
    });
    expect(result.current).toBe(true);

    // 다시 끄면 즉시 반영
    act(() => {
      mockMQ.matches = false;
      mockMQ.listeners.forEach((cb) => cb());
    });
    expect(result.current).toBe(false);
  });

  it("unmount 시 리스너 cleanup (메모리 누수 방지)", () => {
    const { unmount } = renderHook(() => usePrefersReducedMotion());
    expect(mockMQ.listeners.size).toBe(1);
    unmount();
    expect(mockMQ.listeners.size).toBe(0);
  });
});
