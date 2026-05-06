import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import ContactContent from "@/components/marketing/ContactContent";
import { I18nProvider } from "@/contexts/I18nContext";

const wrap = (ui: ReactNode) => render(<I18nProvider>{ui}</I18nProvider>);

describe("ContactContent", () => {
  it("renders the institutional inquiry form with the LMS picker", () => {
    wrap(<ContactContent />);
    expect(screen.getByText("기관 라이선스 견적 문의")).toBeTruthy();
    expect(screen.getByLabelText(/^기관명/)).toBeTruthy();
    expect(screen.getByLabelText(/검토 중인 LMS/)).toBeTruthy();
  });

  it("rejects non-numeric professor/student counts", () => {
    wrap(<ContactContent />);

    fireEvent.change(screen.getByLabelText(/^기관명/), {
      target: { value: "○○대학교" },
    });
    fireEvent.change(screen.getByLabelText(/^담당자 이름/), {
      target: { value: "홍길동" },
    });
    fireEvent.change(screen.getByLabelText(/^직책/), {
      target: { value: "학과장" },
    });
    fireEvent.change(screen.getByLabelText(/^이메일/), {
      target: { value: "hong@uni.ac.kr" },
    });
    fireEvent.change(screen.getByLabelText(/^연락처/), {
      target: { value: "02-1234-5678" },
    });
    fireEvent.change(screen.getByLabelText(/도입 검토 단계/), {
      target: { value: "internal" },
    });
    fireEvent.change(screen.getByLabelText(/예상 교수자 수/), {
      target: { value: "열두 명" },
    });
    fireEvent.change(screen.getByLabelText(/예상 학생 수/), {
      target: { value: "600" },
    });
    fireEvent.change(screen.getByLabelText(/검토 중인 LMS/), {
      target: { value: "klas" },
    });
    fireEvent.change(screen.getByLabelText(/통화 가능 시간/), {
      target: { value: "평일 오후" },
    });

    fireEvent.click(screen.getByRole("button", { name: /견적 문의 보내기/ }));

    const alerts = screen.getAllByRole("alert");
    expect(alerts.some((el) => /숫자만/.test(el.textContent ?? ""))).toBe(true);
  });

  it("shows the success screen after a valid mock submit", async () => {
    wrap(<ContactContent />);
    fireEvent.change(screen.getByLabelText(/^기관명/), {
      target: { value: "○○대학교" },
    });
    fireEvent.change(screen.getByLabelText(/^담당자 이름/), {
      target: { value: "홍길동" },
    });
    fireEvent.change(screen.getByLabelText(/^직책/), {
      target: { value: "학과장" },
    });
    fireEvent.change(screen.getByLabelText(/^이메일/), {
      target: { value: "hong@uni.ac.kr" },
    });
    fireEvent.change(screen.getByLabelText(/^연락처/), {
      target: { value: "02-1234-5678" },
    });
    fireEvent.change(screen.getByLabelText(/도입 검토 단계/), {
      target: { value: "internal" },
    });
    fireEvent.change(screen.getByLabelText(/예상 교수자 수/), {
      target: { value: "12" },
    });
    fireEvent.change(screen.getByLabelText(/예상 학생 수/), {
      target: { value: "600" },
    });
    fireEvent.change(screen.getByLabelText(/검토 중인 LMS/), {
      target: { value: "klas" },
    });
    fireEvent.change(screen.getByLabelText(/통화 가능 시간/), {
      target: { value: "평일 오후 2-5시" },
    });

    fireEvent.click(screen.getByRole("button", { name: /견적 문의 보내기/ }));
    await waitFor(
      () => {
        expect(screen.getByText("문의가 접수되었습니다")).toBeTruthy();
      },
      { timeout: 1500 },
    );
  });
});
