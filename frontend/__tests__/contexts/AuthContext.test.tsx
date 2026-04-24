import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

// JWT payload: { sub: "user-1", role: "student" }
const FAKE_ACCESS = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEiLCJyb2xlIjoic3R1ZGVudCJ9.fake";
const FAKE_REFRESH = "refresh-token-123";

function TestConsumer() {
  const { user, isLoading, login, logout } = useAuth();
  return (
    <div>
      <p data-testid="loading">{isLoading ? "loading" : "done"}</p>
      <p data-testid="user">{user ? `${user.id}:${user.role}` : "null"}</p>
      <button onClick={() => login(FAKE_ACCESS, FAKE_REFRESH)}>Login</button>
      <button onClick={() => logout()}>Logout</button>
    </div>
  );
}

describe("AuthContext", () => {
  beforeEach(() => {
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

  it("restores user from localStorage on mount", () => {
    localStorage.setItem("ifl_access_token", FAKE_ACCESS);
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );
    expect(screen.getByTestId("user").textContent).toBe("user-1:student");
  });

  it("login stores tokens in localStorage", () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );
    act(() => screen.getByText("Login").click());
    expect(localStorage.getItem("ifl_access_token")).toBe(FAKE_ACCESS);
    expect(localStorage.getItem("ifl_refresh_token")).toBe(FAKE_REFRESH);
  });
});
