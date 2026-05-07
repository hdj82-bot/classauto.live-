import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/contexts/I18nContext";
import { ToastProvider } from "@/components/ui/Toast";
import CsvExportButton from "@/components/professor/analytics/CsvExportButton";

const apiGet = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    get: (url: string, opts?: unknown) => apiGet(url, opts),
  },
}));

const wrap = (ui: React.ReactNode) => (
  <I18nProvider>
    <ToastProvider>{ui}</ToastProvider>
  </I18nProvider>
);

beforeEach(() => {
  apiGet.mockReset();
  // jsdom: createObjectURL/revokeObjectURL 미구현 → 모킹
  Object.defineProperty(window.URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:mock",
  });
  Object.defineProperty(window.URL, "revokeObjectURL", {
    configurable: true,
    value: () => undefined,
  });
});

describe("CsvExportButton", () => {
  it("calls the export endpoint with blob responseType when clicked", async () => {
    apiGet.mockResolvedValue({ data: new Blob(["a,b\n1,2"]) });
    render(wrap(<CsvExportButton lectureId="LEC-1" />));

    const btn = screen.getByRole("button", { name: /CSV/ });
    fireEvent.click(btn);

    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(1));
    expect(apiGet).toHaveBeenCalledWith(
      "/api/v1/dashboard/LEC-1/export/csv",
      expect.objectContaining({ responseType: "blob" }),
    );
  });

  it("shows the loading label while exporting", async () => {
    let resolveFn: ((v: { data: Blob }) => void) | undefined;
    apiGet.mockImplementation(
      () =>
        new Promise<{ data: Blob }>((res) => {
          resolveFn = res;
        }),
    );
    render(wrap(<CsvExportButton lectureId="LEC-2" />));

    const btn = screen.getByRole("button", { name: /CSV/ });
    fireEvent.click(btn);
    expect(screen.getByText("내보내는 중...")).toBeTruthy();
    expect(btn.getAttribute("aria-busy")).toBe("true");

    // 미해결 promise 가 매달리지 않도록 정리
    resolveFn?.({ data: new Blob(["x"]) });
    await waitFor(() => expect(btn.getAttribute("aria-busy")).toBeFalsy());
  });
});
