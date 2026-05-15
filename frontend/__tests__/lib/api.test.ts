import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

async function loadApiModule() {
  return await import("@/lib/api");
}

describe("API_URL resolution", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses NEXT_PUBLIC_API_URL when set", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.com");
    const { API_URL } = await loadApiModule();
    expect(API_URL).toBe("https://api.example.com");
  });

  it("falls back to localhost only in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    const { API_URL } = await loadApiModule();
    expect(API_URL).toBe("http://localhost:8000");
  });

  it("throws in production when NEXT_PUBLIC_API_URL is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    await expect(loadApiModule()).rejects.toThrow(/NEXT_PUBLIC_API_URL/);
  });
});

describe("isStripeCheckoutUrl", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts a real Stripe checkout URL over https", async () => {
    const { isStripeCheckoutUrl } = await loadApiModule();
    expect(
      isStripeCheckoutUrl("https://checkout.stripe.com/c/pay/cs_test_abc"),
    ).toBe(true);
  });
});

// 후속 정리 ④: frontend OAuth state 레이어(oauthState issue/consume/hasIssued
// + OAUTH_STATE_KEY)는 백엔드 Redis 단일 검증 일원화(2026-05-12)로 dead
// code 가 되어 제거됐다. 해당 7개 단위 테스트도 함께 careful drop. 아래
// startGoogleLogin 케이스를 "state 미발급" 회귀 가드로 재작성해 손실 보전.

describe("startGoogleLogin", () => {
  let originalLocation: Location;

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.com");
    window.sessionStorage.clear();
    originalLocation = window.location;
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
    vi.unstubAllEnvs();
  });

  it("redirects with role only — no frontend state issued (backend single-source)", async () => {
    const { startGoogleLogin } = await loadApiModule();

    let assigned = "";
    Object.defineProperty(window, "location", {
      value: {
        set href(value: string) {
          assigned = value;
        },
        get href() {
          return assigned;
        },
      },
      writable: true,
      configurable: true,
    });

    startGoogleLogin("professor");

    const url = new URL(assigned);
    expect(url.origin).toBe("https://api.example.com");
    expect(url.pathname).toBe("/api/auth/google");
    expect(url.searchParams.get("role")).toBe("professor");
    // 프론트는 더 이상 state 를 발급/동봉하지 않는다 (백엔드 Redis 단일 검증).
    expect(url.searchParams.get("state")).toBeNull();
    // 레거시 sessionStorage 키도 쓰지 않는다 (잔재는 silent ignore).
    expect(window.sessionStorage.getItem("ifl_oauth_state")).toBeNull();
  });
});
