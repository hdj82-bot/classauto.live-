import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import BulkActions from "@/components/professor/learners/BulkActions";
import { I18nProvider } from "@/contexts/I18nContext";

const wrap = (ui: React.ReactNode) =>
  render(<I18nProvider>{ui}</I18nProvider>);

describe("BulkActions", () => {
  it("disables all buttons when nothing selected", () => {
    wrap(
      <BulkActions
        selectedCount={0}
        onExportSelected={vi.fn()}
        onSendNudge={vi.fn()}
        onSendEncouragement={vi.fn()}
      />,
    );
    expect(
      (screen.getByTestId("learners-bulk-nudge") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByTestId("learners-bulk-export") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("activates buttons once selection > 0", () => {
    const onSendNudge = vi.fn();
    wrap(
      <BulkActions
        selectedCount={3}
        onExportSelected={vi.fn()}
        onSendNudge={onSendNudge}
        onSendEncouragement={vi.fn()}
      />,
    );
    const nudge = screen.getByTestId("learners-bulk-nudge") as HTMLButtonElement;
    expect(nudge.disabled).toBe(false);
    fireEvent.click(nudge);
    expect(onSendNudge).toHaveBeenCalledOnce();
  });

  it("flags backend-pending actions with the 'pending' label", () => {
    wrap(
      <BulkActions
        selectedCount={1}
        onExportSelected={vi.fn()}
        onSendNudge={vi.fn()}
        onSendEncouragement={vi.fn()}
      />,
    );
    // 두 발송 버튼 모두 '준비 중' 라벨 노출
    const pending = screen.getAllByText("준비 중");
    expect(pending.length).toBe(2);
  });

  it("triggers CSV export immediately (frontend-only)", () => {
    const onExport = vi.fn();
    wrap(
      <BulkActions
        selectedCount={2}
        onExportSelected={onExport}
        onSendNudge={vi.fn()}
        onSendEncouragement={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("learners-bulk-export"));
    expect(onExport).toHaveBeenCalledOnce();
  });
});
