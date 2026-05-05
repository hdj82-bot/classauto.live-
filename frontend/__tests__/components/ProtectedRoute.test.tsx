import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  user: null as null | { id: string; role: "professor" | "student" | "admin" },
  isLoading: false,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mocks.replace,
    push: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: mocks.user, isLoading: mocks.isLoading }),
}));

import ProtectedRoute from "@/components/ProtectedRoute";

describe("ProtectedRoute", () => {
  it("renders spinner while AuthContext is loading (no flicker)", () => {
    mocks.user = null;
    mocks.isLoading = true;
    render(<ProtectedRoute><div>protected child</div></ProtectedRoute>);
    expect(screen.queryByText("protected child")).toBeNull();
  });

  it("redirects to /auth/login when not authenticated", async () => {
    mocks.user = null;
    mocks.isLoading = false;
    mocks.replace.mockReset();
    render(<ProtectedRoute><div>protected child</div></ProtectedRoute>);
    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/auth/login");
    });
    expect(screen.queryByText("protected child")).toBeNull();
  });

  it("redirects to /dashboard when role is not allowed", async () => {
    mocks.user = { id: "u1", role: "student" };
    mocks.isLoading = false;
    mocks.replace.mockReset();
    render(
      <ProtectedRoute allowedRoles={["admin"]}>
        <div>protected child</div>
      </ProtectedRoute>,
    );
    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("renders children when user role is allowed", async () => {
    mocks.user = { id: "u1", role: "admin" };
    mocks.isLoading = false;
    render(
      <ProtectedRoute allowedRoles={["admin"]}>
        <div>protected child</div>
      </ProtectedRoute>,
    );
    await waitFor(() => {
      expect(screen.getByText("protected child")).toBeTruthy();
    });
  });
});
