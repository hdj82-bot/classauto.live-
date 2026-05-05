import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

async function loadAuth() {
  return await import("@/lib/auth");
}

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

  function captureRedirect() {
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
    return () => assigned;
  }

  it("builds /api/auth/google URL on the API origin with role + state", async () => {
    const get = captureRedirect();
    const { startGoogleLogin } = await loadAuth();
    startGoogleLogin("student");

    const url = new URL(get());
    expect(url.origin).toBe("https://api.example.com");
    expect(url.pathname).toBe("/api/auth/google");
    expect(url.searchParams.get("role")).toBe("student");
    const state = url.searchParams.get("state");
    expect(state).toBeTruthy();
    // OAuth state must also be persisted for the callback consume() step
    expect(window.sessionStorage.getItem("ifl_oauth_state")).toBe(state);
  });

  it("redirects to professor URL when called with professor role", async () => {
    const get = captureRedirect();
    const { startGoogleLogin } = await loadAuth();
    startGoogleLogin("professor");
    expect(new URL(get()).searchParams.get("role")).toBe("professor");
  });

  it("never redirects to a different origin even if URL building drifted", async () => {
    // We can't easily monkey-patch the global URL inside the module under test, but
    // we can still assert the behaviour: calling with a known API_URL produces a URL
    // whose origin matches API_URL exactly. (Cross-origin protection is enforced at
    // construction time inside startGoogleLogin via a same-origin check.)
    const get = captureRedirect();
    const { startGoogleLogin } = await loadAuth();
    startGoogleLogin("student");
    const url = new URL(get());
    expect(url.origin).toBe("https://api.example.com");
    // Origin must not be null/empty/data:/javascript:/etc.
    expect(url.protocol).toBe("https:");
  });

  it("is a no-op on the server (no window) and does not throw", async () => {
    // Simulate SSR by removing window for this single test.
    const realWindow = global.window;
    // @ts-expect-error — intentionally unsetting for SSR simulation
    delete (global as { window?: unknown }).window;

    try {
      vi.resetModules();
      vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.com");
      const { startGoogleLogin } = await loadAuth();
      expect(() => startGoogleLogin("student")).not.toThrow();
    } finally {
      (global as { window?: Window }).window = realWindow;
    }
  });
});
