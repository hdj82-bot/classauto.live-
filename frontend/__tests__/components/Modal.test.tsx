import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import Modal from "@/components/ui/Modal";
import { I18nProvider } from "@/contexts/I18nContext";

const renderWithI18n = (ui: ReactNode) => render(<I18nProvider>{ui}</I18nProvider>);

describe("Modal", () => {
  it("renders nothing when closed", () => {
    renderWithI18n(<Modal open={false}><p>Content</p></Modal>);
    expect(screen.queryByText("Content")).toBeNull();
  });

  it("renders content when open", () => {
    renderWithI18n(<Modal open={true}><p>Content</p></Modal>);
    expect(screen.getByText("Content")).toBeTruthy();
  });

  it("renders title", () => {
    renderWithI18n(<Modal open={true} title="테스트 제목"><p>Body</p></Modal>);
    expect(screen.getByText("테스트 제목")).toBeTruthy();
  });

  it("calls onClose when close button clicked", () => {
    const onClose = vi.fn();
    renderWithI18n(<Modal open={true} onClose={onClose} title="Title"><p>Body</p></Modal>);
    const closeBtn = screen.getByLabelText("닫기");
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose on ESC key", () => {
    const onClose = vi.fn();
    renderWithI18n(<Modal open={true} onClose={onClose}><p>Body</p></Modal>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose on backdrop click", () => {
    const onClose = vi.fn();
    renderWithI18n(<Modal open={true} onClose={onClose}><p>Body</p></Modal>);
    const backdrop = document.querySelector(".bg-black\\/50");
    if (backdrop) fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not close when closable=false", () => {
    const onClose = vi.fn();
    renderWithI18n(<Modal open={true} onClose={onClose} closable={false}><p>Body</p></Modal>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("has aria-modal attribute", () => {
    renderWithI18n(<Modal open={true}><p>Body</p></Modal>);
    const dialog = document.querySelector("[role='dialog']");
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
  });
});
