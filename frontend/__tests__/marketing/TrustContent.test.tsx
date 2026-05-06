import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import TrustContent from "@/components/marketing/TrustContent";
import { I18nProvider } from "@/contexts/I18nContext";

const wrap = (ui: ReactNode) => render(<I18nProvider>{ui}</I18nProvider>);

describe("TrustContent", () => {
  it("surfaces the four CLAUDE.md differentiators as principle cards", () => {
    wrap(<TrustContent />);
    expect(screen.getByText("ClassAuto는 학생을 위한 도구입니다.")).toBeTruthy();
    expect(screen.getByText("RAG 범위 제한 Q&A")).toBeTruthy();
    expect(screen.getByText("비용 투명성")).toBeTruthy();
    expect(screen.getByText("부정행위 방지")).toBeTruthy();
    expect(screen.getByText("학생 데이터 보호")).toBeTruthy();
  });

  it("renders the four data-handling sections (collected/access/deletion/location)", () => {
    wrap(<TrustContent />);
    expect(screen.getByText("어떤 데이터를 수집하나요?")).toBeTruthy();
    expect(screen.getByText("누가 볼 수 있나요?")).toBeTruthy();
    expect(screen.getByText("언제 삭제되나요?")).toBeTruthy();
    expect(screen.getByText("어디에 저장되나요?")).toBeTruthy();
    // privacy email visible somewhere
    expect(screen.getByText(/privacy@classauto\.live/)).toBeTruthy();
  });
});
