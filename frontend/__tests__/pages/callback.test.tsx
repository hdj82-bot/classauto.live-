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

// 후속 정리 ④: lib/api.ts 의 frontend OAuth state 레이어(oauthState/
// OAUTH_STATE_KEY)는 dead code 로 제거됐다. CallbackContent 는 원래부터
// 이를 import 하지 않으므로 mock 에서도 oauthState 키를 드롭한다.
vi.mock("@/lib/api", () => ({
  authApi: { exchange: mocks.exchange },
}));

import CallbackContent from "@/app/auth/callback/CallbackContent";

const FAKE_JWT =
  "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1LTEiLCJyb2xlIjoicHJvZmVzc29yIn0.sig";

describe("CallbackContent", () => {
  beforeEach(() => {
    mocks.replace.mockReset();
    mocks.exchange.mockReset();
    mocks.login.mockReset();
    mocks.searchParams = new URLSearchParams();
    window.sessionStorage.clear();
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

  it("trusts backend state validation (passes server state straight to exchange)", async () => {
    mocks.searchParams = new URLSearchParams("code=abc&state=server-issued");
    mocks.exchange.mockResolvedValue({ data: { access_token: FAKE_JWT } });
    render(<CallbackContent />);
    await waitFor(() => {
      expect(mocks.exchange).toHaveBeenCalledWith("abc", "server-issued");
    });
  });

  it("ignores a stale ifl_oauth_state sessionStorage residue and proceeds (v2 회귀)", async () => {
    // 후속 정리 ④ 회귀: frontend OAuth state 레이어 제거 전 사용자 세션에
    // 남았을 수 있는 옛 `ifl_oauth_state` 잔재가 새 빌드의 정상 콜백 흐름을
    // 가로막지 않아야 한다. 잔재를 실제로 심어두고도 CallbackContent 는
    // 이를 읽지 않고 서버 state 로 곧장 exchange 해야 한다 (silent ignore).
    window.sessionStorage.setItem("ifl_oauth_state", "legacy-stale-value");
    mocks.searchParams = new URLSearchParams("code=abc&state=server-issued");
    mocks.exchange.mockResolvedValue({ data: { access_token: FAKE_JWT } });
    render(<CallbackContent />);
    await waitFor(() => {
      expect(mocks.exchange).toHaveBeenCalledWith("abc", "server-issued");
    });
    expect(mocks.replace).not.toHaveBeenCalledWith("/auth/login?error=invalid_state");
    // 잔재는 그대로 둔다 — 읽지도, 정리하지도 않는 silent ignore.
    expect(window.sessionStorage.getItem("ifl_oauth_state")).toBe(
      "legacy-stale-value",
    );
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
