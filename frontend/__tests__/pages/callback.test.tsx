import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

/**
 * v2 (2026-05-12) 정책 갱신:
 *
 * `oauthState` 의 client-side CSRF 검증 분기가 callback 핸들러에서 제거됐다.
 * (`feat/auth-state-csrf-removal`, commit 14153c3 + faf860e.)
 *
 * 이유: 프론트가 발급한 sessionStorage state 가 백엔드→Google→백엔드 라운드트립
 * 후 콜백 URL 로 echo 되지 않아 `consume()` 가 항상 mismatch 로 실패하던
 * invalid_state 버그. CSRF 방어는 백엔드 Redis state (UUID + getdel + 10분 TTL)
 * 로 일원화했고, 프론트 측 검증 레이어는 폐기.
 *
 * 본 테스트에서 다음 두 케이스를 삭제:
 *   - "rejects when frontend-issued state mismatches received state"
 *   - "rejects when frontend-issued state but received state missing"
 *
 * 두 케이스가 검증하던 분기 자체가 CallbackContent 에서 사라졌으므로 단순히
 * 삭제. 옛 잔재 sessionStorage state 가 새 빌드에서 정상 흐름을 가로막지
 * 않는지는 마지막 케이스 ("ignores stale sessionStorage state ...") 로 회귀
 * 보호한다.
 */

// vi.mock 팩토리 안에서 외부 변수를 참조할 때는 vi.hoisted 로 함께 hoist 시켜야 한다.
const mocks = vi.hoisted(() => {
  return {
    replace: vi.fn(),
    exchange: vi.fn(),
    login: vi.fn(),
    hasIssued: vi.fn().mockReturnValue(false),
    consume: vi.fn().mockReturnValue({ ok: true }),
    searchParams: new URLSearchParams(),
  };
});

vi.mock("next/navigation", () => ({
  useSearchParams: () => mocks.searchParams,
  useRouter: () => ({
    replace: mocks.replace,
    push: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ login: mocks.login }),
}));

vi.mock("@/lib/api", () => ({
  authApi: { exchange: mocks.exchange },
  // oauthState 는 더 이상 CallbackContent 에서 import 되지 않지만, lib/api.ts
  // 의 dead duplicate (패치 3 미적용) 호환을 위해 mock 자체는 남겨둔다.
  // 회귀 테스트(마지막 케이스) 에서 hasIssued=true 잔재 케이스도 검증.
  oauthState: {
    hasIssued: mocks.hasIssued,
    consume: mocks.consume,
    issue: vi.fn(),
  },
}));

import CallbackContent from "@/app/auth/callback/CallbackContent";

const FAKE_JWT =
  "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1LTEiLCJyb2xlIjoicHJvZmVzc29yIn0.sig";

describe("CallbackContent", () => {
  beforeEach(() => {
    mocks.replace.mockReset();
    mocks.exchange.mockReset();
    mocks.login.mockReset();
    mocks.hasIssued.mockReset().mockReturnValue(false);
    mocks.consume.mockReset().mockReturnValue({ ok: true });
    mocks.searchParams = new URLSearchParams();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /auth/login with invalid_state when code missing", async () => {
    mocks.searchParams = new URLSearchParams();
    render(<CallbackContent />);
    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/auth/login?error=invalid_state");
    });
    expect(mocks.exchange).not.toHaveBeenCalled();
  });

  it("exchanges code and redirects professor to dashboard", async () => {
    mocks.searchParams = new URLSearchParams("code=abc&state=xyz");
    mocks.exchange.mockResolvedValue({ data: { access_token: FAKE_JWT } });
    render(<CallbackContent />);
    await waitFor(() => {
      expect(mocks.exchange).toHaveBeenCalledWith("abc", "xyz");
      expect(mocks.login).toHaveBeenCalledWith(FAKE_JWT);
      expect(mocks.replace).toHaveBeenCalledWith("/professor/dashboard");
    });
  });

  it("trusts backend state validation when frontend never issued one", async () => {
    mocks.searchParams = new URLSearchParams("code=abc&state=server-issued");
    mocks.hasIssued.mockReturnValue(false);
    mocks.exchange.mockResolvedValue({ data: { access_token: FAKE_JWT } });
    render(<CallbackContent />);
    await waitFor(() => {
      expect(mocks.exchange).toHaveBeenCalledWith("abc", "server-issued");
    });
  });

  it("ignores stale sessionStorage state and proceeds to exchange (v2 회귀)", async () => {
    // 패치 1 적용 전 사용자에게 남아있을 수 있는 옛 ifl_oauth_state sessionStorage
    // 잔재가 새 빌드에서 정상 흐름을 가로막지 않아야 한다. CallbackContent 는
    // oauthState 를 더 이상 호출하지 않으므로 hasIssued 가 true 라도 exchange
    // 로 곧장 진행되어야 한다.
    mocks.searchParams = new URLSearchParams("code=abc&state=server-issued");
    mocks.hasIssued.mockReturnValue(true);
    mocks.consume.mockReturnValue({ ok: false, reason: "missing" });
    mocks.exchange.mockResolvedValue({ data: { access_token: FAKE_JWT } });
    render(<CallbackContent />);
    await waitFor(() => {
      expect(mocks.exchange).toHaveBeenCalledWith("abc", "server-issued");
    });
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalledWith("/auth/login?error=invalid_state");
  });

  it("redirects to /auth/login on exchange failure", async () => {
    mocks.searchParams = new URLSearchParams("code=abc");
    mocks.exchange.mockRejectedValue(new Error("nope"));
    render(<CallbackContent />);
    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/auth/login?error=exchange_failed");
    });
  });
});
