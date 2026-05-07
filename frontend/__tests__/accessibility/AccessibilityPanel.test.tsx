import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import AccessibilityPanel from "@/components/student/accessibility/AccessibilityPanel";
import { I18nProvider } from "@/contexts/I18nContext";
import { ToastProvider } from "@/components/ui/Toast";

const wrap = (ui: React.ReactNode) =>
  render(
    <I18nProvider>
      <ToastProvider>{ui}</ToastProvider>
    </I18nProvider>,
  );

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("AccessibilityPanel", () => {
  it("renders the floating opener button", () => {
    wrap(<AccessibilityPanel />);
    expect(screen.getByTestId("a11y-open-button")).toBeTruthy();
    expect(screen.queryByTestId("a11y-panel")).toBeNull();
  });

  it("opens the panel on click and reveals all controls", () => {
    wrap(<AccessibilityPanel />);
    fireEvent.click(screen.getByTestId("a11y-open-button"));
    expect(screen.getByTestId("a11y-panel")).toBeTruthy();
    expect(screen.getByTestId("a11y-captions")).toBeTruthy();
    expect(screen.getByTestId("a11y-font-normal")).toBeTruthy();
    expect(screen.getByTestId("a11y-font-large")).toBeTruthy();
    expect(screen.getByTestId("a11y-font-x-large")).toBeTruthy();
    expect(screen.getByTestId("a11y-high-contrast")).toBeTruthy();
    expect(screen.getByTestId("a11y-reduce-motion")).toBeTruthy();
    expect(screen.getByTestId("a11y-shortcuts-open")).toBeTruthy();
  });

  it("toggles captions checkbox", () => {
    wrap(<AccessibilityPanel />);
    fireEvent.click(screen.getByTestId("a11y-open-button"));
    const cb = screen.getByTestId("a11y-captions") as HTMLInputElement;
    expect(cb.checked).toBe(false);
    fireEvent.click(cb);
    expect((screen.getByTestId("a11y-captions") as HTMLInputElement).checked).toBe(true);
  });

  it("font size radio: clicking 'large' sets aria-checked and body class", () => {
    wrap(<AccessibilityPanel />);
    fireEvent.click(screen.getByTestId("a11y-open-button"));
    fireEvent.click(screen.getByTestId("a11y-font-large"));
    expect(screen.getByTestId("a11y-font-large").getAttribute("aria-checked")).toBe(
      "true",
    );
    expect(document.body.classList.contains("a11y-font-large")).toBe(true);
  });

  it("opens the keyboard shortcuts modal via the panel button", () => {
    wrap(<AccessibilityPanel />);
    fireEvent.click(screen.getByTestId("a11y-open-button"));
    fireEvent.click(screen.getByTestId("a11y-shortcuts-open"));
    expect(screen.getByTestId("a11y-shortcuts-modal")).toBeTruthy();
    fireEvent.click(screen.getByTestId("a11y-shortcuts-modal-close"));
    expect(screen.queryByTestId("a11y-shortcuts-modal")).toBeNull();
  });

  it("? key opens the shortcut modal even without panel open", () => {
    wrap(<AccessibilityPanel />);
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "?", bubbles: true }),
      );
    });
    expect(screen.getByTestId("a11y-shortcuts-modal")).toBeTruthy();
  });

  it("opener has accessible aria-label and aria-expanded", () => {
    wrap(<AccessibilityPanel />);
    const opener = screen.getByTestId("a11y-open-button");
    expect(opener.getAttribute("aria-expanded")).toBe("false");
    expect(opener.getAttribute("aria-label")).toBeTruthy();
    fireEvent.click(opener);
    expect(opener.getAttribute("aria-expanded")).toBe("true");
  });
});
