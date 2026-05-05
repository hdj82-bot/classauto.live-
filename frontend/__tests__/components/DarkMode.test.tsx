// N3 (round 4): 다크 모드 dark: variant 회귀 가드.
// 핵심 공유 컴포넌트에서 dark: 클래스가 제거되면 즉시 실패하도록 markup 을 검사.
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";

import Modal from "@/components/ui/Modal";
import { I18nProvider } from "@/contexts/I18nContext";

const renderWithI18n = (ui: ReactNode) => render(<I18nProvider>{ui}</I18nProvider>);

describe("dark mode variants", () => {
  it("Modal panel applies dark:bg-gray-900 / dark:text-gray-100", () => {
    const { container } = renderWithI18n(
      <Modal open={true} title="다크 테스트"><p>본문</p></Modal>,
    );
    // Modal 패널 (role="dialog" 내부의 첫 번째 outer div 다음의 패널)
    const panel = container.querySelector('[role="dialog"] > div:nth-child(2)');
    expect(panel).toBeTruthy();
    const cls = panel!.className;
    expect(cls).toMatch(/dark:bg-gray-900/);
    expect(cls).toMatch(/dark:text-gray-100/);
  });

  it("Modal close button uses type=button (a11y) and dark hover variant", () => {
    const { container } = renderWithI18n(
      <Modal open={true} onClose={() => {}} title="Test"><p>Body</p></Modal>,
    );
    const closeBtn = container.querySelector('[aria-label="닫기"]');
    expect(closeBtn).toBeTruthy();
    expect(closeBtn!.getAttribute("type")).toBe("button");
    expect(closeBtn!.className).toMatch(/dark:hover:/);
  });
});
