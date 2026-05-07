import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "@/contexts/I18nContext";
import ChangelogContent from "@/components/changelog/ChangelogContent";
import type { ChangelogEntry } from "@/components/changelog/types";

const wrap = (ui: React.ReactNode) => <I18nProvider>{ui}</I18nProvider>;

const FIXTURE: ChangelogEntry[] = [
  {
    date: "2026-05-07",
    version: "v0.4.0",
    title: "큰 신규 기능",
    category: "feature",
    bullets: ["bullet a", "bullet b"],
    prs: [
      { label: "#PR-123", href: "/changelog#pr-123" },
      { label: "external", href: "https://example.com/pr-456" },
    ],
  },
  {
    date: "2026-05-06",
    version: "v0.3.5",
    title: "간단한 버그 수정",
    category: "fix",
    bullets: ["fix x"],
  },
  {
    date: "2026-05-05",
    version: "v0.3.0",
    title: "성능 개선",
    category: "improvement",
    bullets: ["faster Q&A"],
  },
  {
    date: "2026-05-04",
    version: "v0.2.0",
    title: "정책 변경",
    category: "breaking",
    bullets: ["RAG threshold 0.6 → 0.7"],
  },
];

describe("ChangelogContent", () => {
  it("renders all entries by default in seed order", () => {
    render(wrap(<ChangelogContent entries={FIXTURE} />));
    expect(screen.getByText("큰 신규 기능")).toBeTruthy();
    expect(screen.getByText("간단한 버그 수정")).toBeTruthy();
    expect(screen.getByText("성능 개선")).toBeTruthy();
    expect(screen.getByText("정책 변경")).toBeTruthy();
    // 4개 모두 timeline 안에
    const list = screen.getByTestId("changelog-timeline");
    expect(list.querySelectorAll("[data-testid^='changelog-entry-']").length)
      .toBe(4);
  });

  it("filters entries when a category chip is selected", () => {
    render(wrap(<ChangelogContent entries={FIXTURE} />));

    // 'Fix' 칩 클릭 (i18n 라벨)
    const fixChip = screen.getByRole("button", { name: /Fix/ });
    fireEvent.click(fixChip);

    // fix 만 노출되어야 함
    expect(screen.getByText("간단한 버그 수정")).toBeTruthy();
    expect(screen.queryByText("큰 신규 기능")).toBeNull();
    expect(screen.queryByText("성능 개선")).toBeNull();
    expect(screen.queryByText("정책 변경")).toBeNull();
  });

  it("returns to all entries when '전체' chip is selected", () => {
    render(wrap(<ChangelogContent entries={FIXTURE} />));
    const fixChip = screen.getByRole("button", { name: /Fix/ });
    fireEvent.click(fixChip);
    expect(screen.queryByText("성능 개선")).toBeNull();

    const allChip = screen.getByRole("button", { name: /전체/ });
    fireEvent.click(allChip);
    expect(screen.getByText("성능 개선")).toBeTruthy();
  });

  it("shows empty state when filter has no matching entries", () => {
    const onlyFeatures: ChangelogEntry[] = [FIXTURE[0]]; // feature 단 1건
    render(wrap(<ChangelogContent entries={onlyFeatures} />));
    fireEvent.click(screen.getByRole("button", { name: /Fix/ }));
    expect(screen.getByText("조건에 맞는 항목이 없습니다.")).toBeTruthy();
  });

  it("renders external PR links with target=_blank rel=noopener", () => {
    render(wrap(<ChangelogContent entries={FIXTURE} />));
    const externalLink = screen.getByText("external") as HTMLAnchorElement;
    expect(externalLink.getAttribute("target")).toBe("_blank");
    expect(externalLink.getAttribute("rel")).toContain("noopener");
  });
});
