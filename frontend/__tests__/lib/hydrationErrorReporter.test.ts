import { describe, it, expect } from "vitest";
import { looksLikeHydrationError } from "@/lib/hydrationErrorReporter";

// 이슈 #167 — React #418 실측 계측의 시그니처 매처 회귀 가드.
// 프로덕션 minified 메시지·개발 메시지·Error 객체·비-hydration 노이즈를
// 각각 고정해 두어, React/Next 업그레이드로 메시지 포맷이 바뀌어 계측이
// 조용히 무력화되는 일을 막는다.

describe("looksLikeHydrationError", () => {
  it("프로덕션 minified #418 URL 형식을 잡는다", () => {
    expect(
      looksLikeHydrationError([
        "Minified React error #418; visit https://react.dev/errors/418?args[]= for the full message",
      ]),
    ).toBe(true);
  });

  it("react.dev/errors/<code> 만 있어도 잡는다 (418/419/421/423/425)", () => {
    for (const code of [418, 419, 421, 423, 425]) {
      expect(
        looksLikeHydrationError([`see https://react.dev/errors/${code}`]),
      ).toBe(true);
    }
  });

  it("개발 모드 비-minified hydration 메시지를 잡는다", () => {
    expect(
      looksLikeHydrationError([
        "Hydration failed because the server rendered HTML didn't match the client.",
      ]),
    ).toBe(true);
    expect(
      looksLikeHydrationError([
        "Warning: Text content did not match. Server: %s Client: %s",
        "ko",
        "en",
      ]),
    ).toBe(true);
  });

  it("Error 객체의 message 도 검사한다", () => {
    expect(
      looksLikeHydrationError([
        new Error("Minified React error #418; visit https://react.dev/errors/418"),
      ]),
    ).toBe(true);
  });

  it("hydration 무관 console.error 는 무시한다 (오탐 방지)", () => {
    expect(looksLikeHydrationError(["Failed to fetch /api/v1/courses"])).toBe(
      false,
    );
    expect(
      looksLikeHydrationError(["Minified React error #310"]), // hooks 규칙 위반 등 비-hydration 계열
    ).toBe(false);
    expect(looksLikeHydrationError([new Error("Network request failed")])).toBe(
      false,
    );
    expect(looksLikeHydrationError([])).toBe(false);
  });
});
