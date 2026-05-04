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

describe("oauthState", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.com");
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("issues a fresh state and persists it to sessionStorage", async () => {
    const { oauthState } = await loadApiModule();
    const s1 = oauthState.issue();
    expect(s1.length).toBeGreaterThanOrEqual(8);
    expect(window.sessionStorage.getItem("ifl_oauth_state")).toBe(s1);
  });

  it("issue() produces unique values", async () => {
    const { oauthState } = await loadApiModule();
    const a = oauthState.issue();
    const b = oauthState.issue();
    expect(a).not.toBe(b);
  });

  it("consume() succeeds when received state matches and clears storage", async () => {
    const { oauthState } = await loadApiModule();
    const issued = oauthState.issue();
    const result = oauthState.consume(issued);
    expect(result.ok).toBe(true);
    expect(window.sessionStorage.getItem("ifl_oauth_state")).toBeNull();
  });

  it("consume() fails on mismatch and still clears storage (no replay)", async () => {
    const { oauthState } = await loadApiModule();
    oauthState.issue();
    const result = oauthState.consume("attacker-state");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("mismatch");
    expect(window.sessionStorage.getItem("ifl_oauth_state")).toBeNull();
  });

  it("consume() fails when state was never issued", async () => {
    const { oauthState } = await loadApiModule();
    const result = oauthState.consume("anything");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("absent");
  });

  it("consume() fails when received state is null", async () => {
    const { oauthState } = await loadApiModule();
    oauthState.issue();
    const result = oauthState.consume(null);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("missing");
  });

  it("hasIssued reflects sessionStorage state", async () => {
    const { oauthState } = await loadApiModule();
    expect(oauthState.hasIssued()).toBe(false);
    oauthState.issue();
    expect(oauthState.hasIssued()).toBe(true);
  });
});

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

  it("issues state and redirects with role and state in query", async () => {
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
    const stateInUrl = url.searchParams.get("state");
    expect(stateInUrl).not.toBeNull();
    expect(window.sessionStorage.getItem("ifl_oauth_state")).toBe(stateInUrl);
  });
});
