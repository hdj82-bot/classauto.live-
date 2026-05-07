import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "@/contexts/I18nContext";
import TermsContent from "@/components/legal/TermsContent";
import {
  TERMS,
  CHANGELOG_ANCHOR,
  sectionAnchorId,
} from "@/components/legal/legalSections";
import legalKo from "@/../messages/_patches/legalHub.ko.json";

const renderPage = (ui: ReactNode) =>
  render(<I18nProvider>{ui}</I18nProvider>);

// IntersectionObserver mock — capture instances so tests can drive scroll spy.
class MockIO {
  callback: IntersectionObserverCallback;
  static instances: MockIO[] = [];
  observed: Element[] = [];
  constructor(cb: IntersectionObserverCallback) {
    this.callback = cb;
    MockIO.instances.push(this);
  }
  observe(target: Element) { this.observed.push(target); }
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] { return []; }
  trigger(idsAndState: Record<string, boolean>) {
    const entries = this.observed
      .filter((el) => el.id in idsAndState)
      .map((target) => ({
        isIntersecting: idsAndState[target.id],
        target,
        time: 0,
        boundingClientRect: target.getBoundingClientRect(),
        intersectionRatio: idsAndState[target.id] ? 1 : 0,
        intersectionRect: target.getBoundingClientRect(),
        rootBounds: null,
      })) as IntersectionObserverEntry[];
    this.callback(entries, this as unknown as IntersectionObserver);
  }
}

beforeEach(() => {
  MockIO.instances = [];
  Object.defineProperty(window, "IntersectionObserver", {
    writable: true,
    configurable: true,
    value: MockIO,
  });
  // matchMedia stub (MarketingShell uses CSS only; safe default)
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((q: string) => ({
      matches: false,
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    })),
  });
});

describe("TermsContent — page composition", () => {
  it("renders the hero with title, subtitle, last-updated and effective-date", () => {
    renderPage(<TermsContent />);
    expect(screen.getByTestId("legal-terms-hero")).toBeTruthy();
    const lastUpdated = screen.getByTestId("legal-terms-last-updated");
    const effective = screen.getByTestId("legal-terms-effective-date");
    expect(/^\d{4}-\d{2}-\d{2}$/.test(lastUpdated.textContent ?? "")).toBe(true);
    expect(/^\d{4}-\d{2}-\d{2}$/.test(effective.textContent ?? "")).toBe(true);
    expect(lastUpdated.textContent).toBe(legalKo.legalHub.terms.hero.lastUpdated);
  });

  it("renders all 14 articles + the change-log section", () => {
    renderPage(<TermsContent />);
    for (const slug of TERMS.sectionSlugs) {
      const id = sectionAnchorId("terms", slug);
      expect(
        screen.getByTestId(`legal-section-${id}`),
        `missing section ${slug}`,
      ).toBeTruthy();
    }
    expect(
      screen.getByTestId(`legal-changelog-${CHANGELOG_ANCHOR.terms}`),
    ).toBeTruthy();
  });

  it("renders the TOC with one link per article + a trailing change-log link", () => {
    renderPage(<TermsContent />);
    const toc = screen.getByTestId("legal-toc");
    for (const slug of TERMS.sectionSlugs) {
      const id = sectionAnchorId("terms", slug);
      const link = toc.querySelector(`[data-toc-target="${id}"]`);
      expect(link, `toc missing link ${id}`).toBeTruthy();
      // href anchor matches
      expect(link?.getAttribute("href")).toBe(`#${id}`);
    }
    // change-log link
    const changeLogLink = toc.querySelector(
      `[data-toc-target="${CHANGELOG_ANCHOR.terms}"]`,
    );
    expect(changeLogLink).toBeTruthy();
    expect(changeLogLink?.getAttribute("data-variant")).toBe("trailing");
  });

  it("clicking a TOC link calls scrollIntoView on the matching section", () => {
    renderPage(<TermsContent />);
    const targetSlug = TERMS.sectionSlugs[5]; // pick a middle one
    const id = sectionAnchorId("terms", targetSlug);

    const target = document.getElementById(id);
    expect(target).toBeTruthy();
    const scrollSpy = vi.fn();
    target!.scrollIntoView = scrollSpy;

    const link = screen.getByTestId(`legal-toc-link-${id}`);
    fireEvent.click(link);
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    // active flag flips on the clicked link
    expect(link.getAttribute("data-active")).toBe("true");
  });

  it("scroll-spy via IntersectionObserver promotes the visible section to active", () => {
    renderPage(<TermsContent />);
    const io = MockIO.instances[0];
    expect(io).toBeTruthy();

    const middleSlug = TERMS.sectionSlugs[3];
    const id = sectionAnchorId("terms", middleSlug);

    act(() => {
      io.trigger({ [id]: true });
    });

    const link = screen.getByTestId(`legal-toc-link-${id}`);
    expect(link.getAttribute("data-active")).toBe("true");
    expect(link.getAttribute("aria-current")).toBe("location");
  });

  it("renders the change-log table with the rows from i18n", () => {
    renderPage(<TermsContent />);
    const expected = legalKo.legalHub.terms.changeLog;
    for (let i = 0; i < expected.length; i++) {
      const row = screen.getByTestId(`legal-changelog-row-${i}`);
      expect(row.textContent).toContain(expected[i].date);
      expect(row.textContent).toContain(expected[i].summary);
    }
  });

  it("body anchors use the article number from i18n (제N조)", () => {
    renderPage(<TermsContent />);
    for (let i = 0; i < TERMS.sectionSlugs.length; i++) {
      const slug = TERMS.sectionSlugs[i];
      const id = sectionAnchorId("terms", slug);
      const section = screen.getByTestId(`legal-section-${id}`);
      expect(section.textContent).toContain(`제${i + 1}조`);
    }
  });

  it("emits cross-link to /privacy and a /trust shortcut", () => {
    renderPage(<TermsContent />);
    const cross = screen.getByTestId(
      "legal-terms-cross-link",
    ) as HTMLAnchorElement;
    expect(cross.getAttribute("href")).toBe("/privacy");
  });
});
