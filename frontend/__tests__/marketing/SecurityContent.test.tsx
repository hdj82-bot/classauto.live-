import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import SecurityContent from "@/components/marketing/SecurityContent";
import { I18nProvider } from "@/contexts/I18nContext";

const wrap = (ui: ReactNode) => render(<I18nProvider>{ui}</I18nProvider>);

describe("SecurityContent", () => {
  it("renders all six numbered security sections", () => {
    wrap(<SecurityContent />);
    expect(screen.getByText("1. 데이터 암호화")).toBeTruthy();
    expect(screen.getByText("2. 접근 통제")).toBeTruthy();
    expect(screen.getByText("3. 인시던트 대응")).toBeTruthy();
    expect(screen.getByText("4. 외부 감사 (계획)")).toBeTruthy();
    expect(screen.getByText("5. 한국 법률 준수")).toBeTruthy();
    expect(screen.getByText("6. API 보안")).toBeTruthy();
  });

  it("lists infrastructure vendors and exposes the security email", () => {
    wrap(<SecurityContent />);
    // Infra table — match the combined "vendor · region" cell to avoid
    // colliding with "Vercel·Railway·Supabase" in the hero subtitle.
    expect(screen.getByText("Frontend")).toBeTruthy();
    expect(screen.getByText(/Vercel · ICN1/)).toBeTruthy();
    expect(screen.getByText(/Supabase · ap-northeast-2/)).toBeTruthy();
    // Contact email is a clickable mailto:
    const vulnLink = screen.getByText("vuln@classauto.live");
    expect(vulnLink.getAttribute("href")).toBe("mailto:vuln@classauto.live");
  });
});
