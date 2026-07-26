import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/contexts/I18nContext";

/**
 * 피드백 진입점의 **자리** — 결정 2026-07-27.
 *
 * 우하단 `position: fixed` 버튼은 스튜디오 ActionBar CTA 를 덮어 2026-06-27 에
 * 철회됐다(#575). 겹침의 원인은 버튼의 존재가 아니라 고정 위치였으므로, 고정 위치만
 * 버리고 진입점은 각 화면의 레이아웃 흐름 안에 둔다.
 *
 * 회귀 가드:
 *   1. 어떤 진입점도 `position: fixed` 를 쓰지 않는다 — 다시 넣으면 같은 사고
 *   2. 스튜디오 ActionBar 안에 진입점이 있다 (그 화면은 사이드바가 없다)
 *   3. 비로그인에는 렌더하지 않는다
 */

const mocks = vi.hoisted(() => ({
  user: { role: "professor" } as { role: string } | null,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/professor/studio/lec-1",
}));

vi.mock("@/contexts/AuthContext", () => ({
  useOptionalAuth: () => (mocks.user ? { user: mocks.user } : null),
}));

vi.mock("@/lib/api", () => ({ feedbackApi: { submit: vi.fn() } }));

import FeedbackLauncher from "@/components/feedback/FeedbackLauncher";
import ActionBar from "@/components/professor/studio/v2/ActionBar";

const wrap = (ui: React.ReactNode) => render(<I18nProvider>{ui}</I18nProvider>);

describe("피드백 진입점 배치", () => {
  beforeEach(() => {
    mocks.user = { role: "professor" };
  });

  it.each(["sidebar", "bar", "card"] as const)(
    "%s 진입점은 position:fixed 를 쓰지 않는다",
    (variant) => {
      wrap(<FeedbackLauncher variant={variant} />);
      const trigger = screen.getByTestId("feedback-launcher");
      // 고정 위치가 곧 겹침이었다. 인라인 style 로도 클래스로도 다시 넣지 말 것.
      expect(trigger.style.position).not.toBe("fixed");
      expect(trigger.className).not.toMatch(/\bfixed\b/);
      let node: HTMLElement | null = trigger;
      while (node && node !== document.body) {
        expect(node.style.position).not.toBe("fixed");
        node = node.parentElement;
      }
    },
  );

  it("스튜디오 ActionBar 안에 진입점이 있다", () => {
    // 이 화면은 몰입 모드라 사이드바가 없다(professor/layout.tsx). 여기 없으면
    // 교수자가 가장 오래 머무는 화면에서 제보 경로가 사라진다.
    wrap(
      <ActionBar
        current={1}
        total={3}
        acceptedCount={1}
        canPrev={false}
        onPrev={() => {}}
        onGenerate={() => {}}
      />,
    );
    expect(screen.getByTestId("feedback-launcher")).toBeTruthy();
  });

  it("ActionBar 의 기본 CTA 를 가리지 않는다", () => {
    wrap(
      <ActionBar
        current={1}
        total={3}
        acceptedCount={1}
        canPrev={false}
        onPrev={() => {}}
        onGenerate={() => {}}
      />,
    );
    // 덮는 게 아니라 같은 바의 형제로 들어간다 — CTA 는 그대로 있어야 한다.
    expect(screen.getByText("슬라이드 쇼 제작")).toBeTruthy();
  });

  it("비로그인에는 렌더하지 않는다", () => {
    mocks.user = null;
    wrap(<FeedbackLauncher variant="sidebar" />);
    // 백엔드가 get_current_user 로 401 이라 눌러도 실패만 한다.
    expect(screen.queryByTestId("feedback-launcher")).toBeNull();
  });

  it("학생 카드에는 무엇을 제보하라는 안내가 붙는다", () => {
    mocks.user = { role: "student" };
    wrap(<FeedbackLauncher variant="card" />);
    expect(screen.getByTestId("feedback-launcher-card")).toBeTruthy();
    expect(screen.getByText(/시청 중에 문제가 있었나요/)).toBeTruthy();
  });
});
