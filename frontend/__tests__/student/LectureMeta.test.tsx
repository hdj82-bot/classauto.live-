import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import LectureMeta from "@/components/student/LectureMeta";
import { I18nProvider } from "@/contexts/I18nContext";

const renderMeta = (ui: ReactNode) => render(<I18nProvider>{ui}</I18nProvider>);

describe("LectureMeta", () => {
  it("renders title, description, and the named-professor trust line", () => {
    renderMeta(
      <LectureMeta
        data={{
          title: "디지털 위안화의 이해",
          description: "CBDC 도입 배경",
          professorName: "하두진",
          courseName: "현대중국사회의이해",
          durationSec: 312,
        }}
      />,
    );

    expect(screen.getByText("디지털 위안화의 이해")).toBeTruthy();
    expect(screen.getByText("CBDC 도입 배경")).toBeTruthy();
    expect(screen.getByText("현대중국사회의이해")).toBeTruthy();
    expect(screen.getByText(/하두진 교수님이 보낸/)).toBeTruthy();
    // 312s -> "5:12"
    expect(screen.getByLabelText("duration").textContent).toBe("5:12");
  });

  it("falls back to the anonymous trust line when no professor name is given", () => {
    renderMeta(
      <LectureMeta
        data={{
          title: "Sample lecture",
          description: null,
          professorName: null,
        }}
      />,
    );

    expect(screen.getByText("Sample lecture")).toBeTruthy();
    expect(screen.getByText(/공유한 강의입니다/)).toBeTruthy();
  });

  it("omits duration when not provided or zero", () => {
    renderMeta(
      <LectureMeta
        data={{
          title: "No duration",
          description: null,
          durationSec: 0,
        }}
      />,
    );
    expect(screen.queryByLabelText("duration")).toBeNull();
  });
});
