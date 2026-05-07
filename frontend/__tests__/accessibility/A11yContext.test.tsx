import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { I18nProvider } from "@/contexts/I18nContext";
import {
  A11yProvider,
  useA11y,
} from "@/components/student/accessibility/A11yContext";

const wrap = ({ children }: { children: React.ReactNode }) => (
  <I18nProvider>
    <A11yProvider>{children}</A11yProvider>
  </I18nProvider>
);

beforeEach(() => {
  window.sessionStorage.clear();
  document.body.classList.remove(
    "a11y-font-large",
    "a11y-font-x-large",
    "a11y-high-contrast",
  );
});

describe("A11yProvider", () => {
  it("starts with default state and 0 localStorage writes", () => {
    const writes: Array<[string, string]> = [];
    const orig = window.localStorage.setItem;
    window.localStorage.setItem = (k: string, v: string) => {
      writes.push([k, v]);
      orig.call(window.localStorage, k, v);
    };
    try {
      const { result } = renderHook(() => useA11y(), { wrapper: wrap });
      expect(result.current.captions).toBe(false);
      expect(result.current.fontSize).toBe("normal");
      expect(result.current.highContrast).toBe(false);
      expect(result.current.reduceMotion).toBe(false);
    } finally {
      window.localStorage.setItem = orig;
    }
    // 정책: localStorage 사용 금지 — sessionStorage 만 허용.
    expect(writes).toEqual([]);
  });

  it("setCaptions toggles state and persists to sessionStorage only", () => {
    const { result } = renderHook(() => useA11y(), { wrapper: wrap });
    act(() => result.current.setCaptions(true));
    expect(result.current.captions).toBe(true);
    expect(window.sessionStorage.getItem("ifl-a11y")).not.toBeNull();
    expect(window.localStorage.getItem("ifl-a11y")).toBeNull();
  });

  it("setFontSize toggles body class accordingly", () => {
    const { result } = renderHook(() => useA11y(), { wrapper: wrap });
    act(() => result.current.setFontSize("large"));
    expect(document.body.classList.contains("a11y-font-large")).toBe(true);
    act(() => result.current.setFontSize("x-large"));
    expect(document.body.classList.contains("a11y-font-x-large")).toBe(true);
    expect(document.body.classList.contains("a11y-font-large")).toBe(false);
    act(() => result.current.setFontSize("normal"));
    expect(document.body.classList.contains("a11y-font-x-large")).toBe(false);
  });

  it("setHighContrast toggles a11y-high-contrast body class", () => {
    const { result } = renderHook(() => useA11y(), { wrapper: wrap });
    act(() => result.current.setHighContrast(true));
    expect(document.body.classList.contains("a11y-high-contrast")).toBe(true);
    act(() => result.current.setHighContrast(false));
    expect(document.body.classList.contains("a11y-high-contrast")).toBe(false);
  });

  it("reset returns all options to defaults", () => {
    const { result } = renderHook(() => useA11y(), { wrapper: wrap });
    act(() => {
      result.current.setCaptions(true);
      result.current.setFontSize("large");
      result.current.setHighContrast(true);
      result.current.setReduceMotion(true);
    });
    act(() => result.current.reset());
    expect(result.current.captions).toBe(false);
    expect(result.current.fontSize).toBe("normal");
    expect(result.current.highContrast).toBe(false);
    expect(result.current.reduceMotion).toBe(false);
  });

  it("falls back to a no-op shape when used outside provider (graceful)", () => {
    const { result } = renderHook(() => useA11y());
    // 호출은 throw 하지 않고 기본값을 반환해야 한다.
    expect(result.current.captions).toBe(false);
    expect(typeof result.current.setCaptions).toBe("function");
    // setter 호출도 throw 안 함.
    expect(() => result.current.setCaptions(true)).not.toThrow();
  });
});
