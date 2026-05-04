import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

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

  it("rejects when frontend-issued state mismatches received state", async () => {
    mocks.searchParams = new URLSearchParams("code=abc&state=evil");
    mocks.hasIssued.mockReturnValue(true);
    mocks.consume.mockReturnValue({ ok: false, reason: "mismatch" });
    render(<CallbackContent />);
    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/auth/login?error=invalid_state");
    });
    expect(mocks.exchange).not.toHaveBeenCalled();
  });

  it("rejects when frontend-issued state but received state missing", async () => {
    mocks.searchParams = new URLSearchParams("code=abc");
    mocks.hasIssued.mockReturnValue(true);
    mocks.consume.mockReturnValue({ ok: false, reason: "missing" });
    render(<CallbackContent />);
    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/auth/login?error=invalid_state");
    });
    expect(mocks.exchange).not.toHaveBeenCalled();
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

  it("redirects to /auth/login on exchange failure", async () => {
    mocks.searchParams = new URLSearchParams("code=abc");
    mocks.exchange.mockRejectedValue(new Error("nope"));
    render(<CallbackContent />);
    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/auth/login?error=exchange_failed");
    });
  });
});
