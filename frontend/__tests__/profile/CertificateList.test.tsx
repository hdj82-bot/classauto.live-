import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CertificateList from "@/components/student/profile/CertificateList";
import { I18nProvider } from "@/contexts/I18nContext";
import { ToastProvider } from "@/components/ui/Toast";

const wrap = (ui: React.ReactNode) =>
  render(
    <I18nProvider>
      <ToastProvider>{ui}</ToastProvider>
    </I18nProvider>,
  );

describe("CertificateList", () => {
  it("renders empty state when items is []", () => {
    wrap(<CertificateList items={[]} />);
    expect(screen.getByTestId("profile-certificates-empty")).toBeTruthy();
  });

  it("renders item rows with PDF and share buttons disabled when no urls (backend pending)", () => {
    wrap(
      <CertificateList
        items={[
          {
            id: "c-1",
            courseId: "co-1",
            title: "한자 한자성어 입문",
            issuedAt: "2026-04-12",
            pdfUrl: null,
            shareUrl: null,
          },
        ]}
      />,
    );
    expect(screen.getByTestId("certificate-c-1")).toBeTruthy();
    const pdf = screen.getByTestId("certificate-c-1-pdf");
    expect(pdf.getAttribute("aria-disabled")).toBe("true");
    const share = screen.getByTestId("certificate-c-1-share") as HTMLButtonElement;
    expect(share.disabled).toBe(true);
  });

  it("activates PDF link with download attribute when pdfUrl present", () => {
    wrap(
      <CertificateList
        items={[
          {
            id: "c-2",
            courseId: "co-2",
            title: "글로벌문화의이해",
            issuedAt: "2026-04-12",
            pdfUrl: "https://cdn.example/x.pdf",
            shareUrl: null,
          },
        ]}
      />,
    );
    const pdf = screen.getByTestId("certificate-c-2-pdf") as HTMLAnchorElement;
    expect(pdf.getAttribute("aria-disabled")).toBe("false");
    expect(pdf.getAttribute("href")).toBe("https://cdn.example/x.pdf");
    expect(pdf.getAttribute("download")).toMatch(/\.pdf$/);
  });

  it("share button copies the URL via clipboard when shareUrl present", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });
    wrap(
      <CertificateList
        items={[
          {
            id: "c-3",
            courseId: "co-3",
            title: "기초중국어",
            issuedAt: "2026-03-01",
            pdfUrl: null,
            shareUrl: "https://classauto.live/cert/abc",
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByTestId("certificate-c-3-share"));
    expect(writeText).toHaveBeenCalledWith("https://classauto.live/cert/abc");
  });
});
