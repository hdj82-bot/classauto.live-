import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { tokens } from "@/lib/tokens";

// JWT payload: { sub: "user-1", role: "student" }
const FAKE_ACCESS =
  "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEiLCJyb2xlIjoic3R1ZGVudCJ9.fake";

function TestConsumer() {
  const { user, isLoading, login } = useAuth();
  return (
    <div>
      <p data-testid="loading">{isLoading ? "loading" : "done"}</p>
      <p data-testid="user">{user ? `${user.id}:${user.role}` : "null"}</p>
      <button onClick={() => login(FAKE_ACCESS)}>Login</button>
    </div>
  );
}

describe("AuthContext", () => {
  beforeEach(() => {
    tokens.clear();
    localStorage.clear();
  });

  it("starts with no user", () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );
    expect(screen.getByTestId("user").textContent).toBe("null");
  });

  it("parses JWT on login and sets user", () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );
    act(() => {
      screen.getByText("Login").click();
    });
    expect(screen.getByTestId("user").textContent).toBe("user-1:student");
  });

  it("does not persist tokens to localStorage (XSS hardening)", () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );
    act(() => screen.getByText("Login").click());
    expect(localStorage.getItem("ifl_access_token")).toBeNull();
    expect(localStorage.getItem("ifl_refresh_token")).toBeNull();
    // access 는 메모리에만 존재해야 한다
    expect(tokens.getAccess()).toBe(FAKE_ACCESS);
  });

  it("does not restore user from localStorage on cold mount", () => {
    // 이전 버전에서는 ifl_access_token 을 localStorage 에 저장했지만,
    // High 5 이후로는 in-memory 전용. 리로드 시 refresh 쿠키로 새 access 를 받는다.
    localStorage.setItem("ifl_access_token", FAKE_ACCESS);
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );
    expect(screen.getByTestId("user").textContent).toBe("null");
  });
});
