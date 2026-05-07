import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "@/contexts/I18nContext";
import { useLandingI18n } from "@/components/landing/useLandingI18n";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nProvider>{children}</I18nProvider>
);

describe("useLandingI18n", () => {
  it("자체 patch 의 짧은 키를 prefix 없이 lookup", () => {
    const { result } = renderHook(() => useLandingI18n(), { wrapper });
    expect(result.current.t("stats.educatorsLabel")).toBe(
      "교수자가 이미 사용 중",
    );
    expect(result.current.t("platform.title")).toContain("한 번 업로드");
  });

  it("tNumber 로 숫자 값을 직접 가져옴 (StatCounter target 용)", () => {
    const { result } = renderHook(() => useLandingI18n(), { wrapper });
    expect(result.current.tNumber("stats.educatorsValue")).toBe(320);
    expect(result.current.tNumber("stats.lecturesValue")).toBe(1840);
    expect(result.current.tNumber("stats.hoursValue")).toBe(12000);
  });

  it("미존재 키는 fallback 으로 key 자체 반환", () => {
    const { result } = renderHook(() => useLandingI18n(), { wrapper });
    expect(result.current.t("nonexistent.path")).toBe("nonexistent.path");
  });

  it("tNumber 미존재 키는 fallback 0 반환", () => {
    const { result } = renderHook(() => useLandingI18n(), { wrapper });
    expect(result.current.tNumber("missing.value")).toBe(0);
  });

  it("params 치환 — chart 의 weekLabel 같은 동적 키", () => {
    const { result } = renderHook(() => useLandingI18n(), { wrapper });
    expect(result.current.t("adoption.chart.weekLabel", { n: 3 })).toBe(
      "3주차",
    );
  });
});
