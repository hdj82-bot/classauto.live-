import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import BetaApplyContent from "@/components/marketing/BetaApplyContent";
import { I18nProvider } from "@/contexts/I18nContext";

const wrap = (ui: ReactNode) => render(<I18nProvider>{ui}</I18nProvider>);

// Use placeholder-based queries — labels share prefixes (e.g. "학교" vs
// "학교 이메일") so substring label matching is ambiguous.
const fillRequired = () => {
  fireEvent.change(screen.getByPlaceholderText("예) 하두진"), {
    target: { value: "하두진" },
  });
  fireEvent.change(screen.getByPlaceholderText("예) 경기대학교"), {
    target: { value: "경기대학교" },
  });
  fireEvent.change(screen.getByPlaceholderText("예) 중어중문학과"), {
    target: { value: "중어중문학과" },
  });
  fireEvent.change(
    screen.getByPlaceholderText(/교수 \/ 부교수 \/ 조교수/),
    { target: { value: "교수" } },
  );
  fireEvent.change(screen.getByPlaceholderText(/name@school\.ac\.kr/), {
    target: { value: "hdj82@kyonggi.ac.kr" },
  });
  fireEvent.change(
    screen.getByPlaceholderText("예) 현대중국사회의이해"),
    { target: { value: "현대중국사회의이해" } },
  );
  fireEvent.change(screen.getByLabelText(/시작 희망 시기/), {
    target: { value: "now" },
  });
  fireEvent.change(screen.getByLabelText(/어떻게 알게 되셨나요/), {
    target: { value: "referral" },
  });
};

describe("BetaApplyContent", () => {
  it("blocks submission and shows required errors when fields are empty", () => {
    wrap(<BetaApplyContent />);
    fireEvent.click(screen.getByRole("button", { name: /신청서 제출/ }));
    // Multiple required-field alerts surface at once.
    const alerts = screen.getAllByRole("alert");
    expect(alerts.length).toBeGreaterThanOrEqual(5);
    // Success screen should NOT have replaced the form.
    expect(screen.queryByText(/신청이 접수되었습니다/)).toBeNull();
  });

  it("flags malformed email addresses on submit", () => {
    wrap(<BetaApplyContent />);
    fillRequired();
    fireEvent.change(screen.getByPlaceholderText(/name@school\.ac\.kr/), {
      target: { value: "not-an-email" },
    });
    fireEvent.click(screen.getByRole("button", { name: /신청서 제출/ }));
    const alerts = screen.getAllByRole("alert");
    expect(
      alerts.some((el) => /올바른 이메일/.test(el.textContent ?? "")),
    ).toBe(true);
  });

  it("renders the success screen after a valid mock submit", async () => {
    wrap(<BetaApplyContent />);
    fillRequired();
    fireEvent.click(screen.getByRole("button", { name: /신청서 제출/ }));
    await waitFor(
      () => {
        expect(screen.getByText("신청이 접수되었습니다")).toBeTruthy();
      },
      { timeout: 1500 },
    );
  });
});
