import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { tokens } from "@/lib/tokens";

/**
 * H4 — AuthContext 가 부트스트랩/로그인 후 /me 로 user.email·name 을 보강하는지 검증.
 *
 * 종전엔 JWT(sub·role)만으로 user 를 만들어 email/name 이 영구 "" 였고, 그 탓에
 * 분석 PRO·종합보고서 노출 게이트와 이니셜·학생 이름 표시가 망가졌다.
 */

const getMe = vi.fn();

vi.mock("@/lib/api", () => ({
  bootstrapAuth: vi.fn().mockResolvedValue(true),
  authApi: { logout: vi.fn().mockResolvedValue(null) },
  userApi: { getMe: () => getMe() },
}));

import { AuthProvider, useAuth } from "@/contexts/AuthContext";

// header.payload.sig — payload 만 parseJwt 가 읽는다(atob). btoa 로 안전하게 생성.
function makeAccess(sub: string, role = "professor") {
  const payload = btoa(JSON.stringify({ sub, role }));
  return `header.${payload}.sig`;
}

function Consumer() {
  const { user } = useAuth();
  return (
    <div>
      <p data-testid="email">{user?.email ?? "—"}</p>
      <p data-testid="name">{user?.name ?? "—"}</p>
      <p data-testid="id">{user?.id ?? "—"}</p>
    </div>
  );
}

describe("AuthContext /me 보강 (H4)", () => {
  beforeEach(() => {
    tokens.clear();
    getMe.mockReset();
  });

  it("부트스트랩 후 /me 로 email·name 을 채운다", async () => {
    tokens.set(makeAccess("user-1"));
    getMe.mockResolvedValue({
      data: {
        id: "user-1",
        email: "prof@kyonggi.ac.kr",
        name: "하두진",
        role: "professor",
        onboarded_at: null,
      },
    });

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("email").textContent).toBe("prof@kyonggi.ac.kr"),
    );
    expect(screen.getByTestId("name").textContent).toBe("하두진");
    expect(screen.getByTestId("id").textContent).toBe("user-1");
    expect(getMe).toHaveBeenCalled();
  });

  it("토큰이 없으면 /me 를 호출하지 않는다", async () => {
    // 토큰 미설정 — 부트스트랩이 access 복원에 실패한 상태.
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    // 보강 effect 가 도는 시간을 준 뒤에도 호출 0 + user 없음.
    await waitFor(() => expect(screen.getByTestId("id").textContent).toBe("—"));
    expect(getMe).not.toHaveBeenCalled();
  });
});
