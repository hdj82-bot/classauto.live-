import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/contexts/I18nContext";
import EntryCard from "@/components/changelog/EntryCard";

const wrap = (ui: React.ReactNode) => <I18nProvider>{ui}</I18nProvider>;

describe("EntryCard", () => {
  it("renders date, version, title, bullets and category badge", () => {
    render(
      wrap(
        <EntryCard
          entry={{
            date: "2026-05-07",
            version: "v0.4.0",
            title: "예시 항목",
            category: "feature",
            bullets: ["bullet 하나", "bullet 둘"],
          }}
        />,
      ),
    );
    expect(screen.getByText("2026-05-07")).toBeTruthy();
    expect(screen.getByText(/v0\.4\.0/)).toBeTruthy();
    expect(screen.getByText("예시 항목")).toBeTruthy();
    expect(screen.getByText("bullet 하나")).toBeTruthy();
    expect(screen.getByText("bullet 둘")).toBeTruthy();
    // 카테고리 배지 — Feature
    expect(screen.getByText(/Feature/)).toBeTruthy();
  });

  it("omits the PR row when prs is empty", () => {
    render(
      wrap(
        <EntryCard
          entry={{
            date: "2026-05-06",
            version: "v0.1.0",
            title: "PR 없음",
            category: "fix",
            bullets: ["fix only"],
          }}
        />,
      ),
    );
    expect(screen.queryByText(/관련 PR|Related PR/)).toBeNull();
  });
});
