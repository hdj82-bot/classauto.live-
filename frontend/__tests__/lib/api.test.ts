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

// 스펙 14 §A — 발급 요청 body 에 cohort 가 실리는지.
//
// cohort 전파 자체는 A 의 범위가 아니다. `professor_invites.cohort` 저장은
// backend `tests/test_invites.py` 가, 가입 시 `invite.cohort → users.cohort`
// 복사는 `app/api/v1/auth.py` 가 이미 책임진다. 프론트가 증명할 몫은
// "선택한 코호트가 요청 body 에 담기고, 미지정이면 키 자체가 빠지는가" 하나다
// (백엔드 `InviteCreateRequest.cohort` 는 Optional 이라 키가 없어야 None).
describe("ownerInviteApi.create — cohort payload", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  /** create() 를 호출하고 실제로 POST 된 body 를 돌려준다. */
  async function postedBody(...args: [string, (string | null)?]) {
    const mod = await loadApiModule();
    const post = vi.spyOn(mod.api, "post").mockResolvedValue({ data: {} } as never);
    await mod.ownerInviteApi.create(...args);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toBe("/api/owner/invites");
    return post.mock.calls[0][1] as Record<string, unknown>;
  }

  it("코호트를 고르면 body 에 실어 보낸다", async () => {
    expect(await postedBody("prof@k.ac.kr", "2026-08")).toEqual({
      email: "prof@k.ac.kr",
      cohort: "2026-08",
    });
  });

  it("미지정(null)이면 cohort 키 자체를 보내지 않는다", async () => {
    const body = await postedBody("prof@k.ac.kr", null);
    expect(body).toEqual({ email: "prof@k.ac.kr" });
    expect("cohort" in body).toBe(false);
  });

  it("인자를 생략해도 cohort 키가 없다(기존 호출부 호환)", async () => {
    expect(await postedBody("prof@k.ac.kr")).toEqual({ email: "prof@k.ac.kr" });
  });

  it("빈 문자열도 미지정으로 취급한다", async () => {
    expect(await postedBody("prof@k.ac.kr", "")).toEqual({
      email: "prof@k.ac.kr",
    });
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
