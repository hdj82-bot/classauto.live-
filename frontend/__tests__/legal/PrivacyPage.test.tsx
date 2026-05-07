import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "@/contexts/I18nContext";
import PrivacyContent from "@/components/legal/PrivacyContent";
import {
  PRIVACY,
  CHANGELOG_ANCHOR,
  sectionAnchorId,
} from "@/components/legal/legalSections";
import legalKo from "@/../messages/_patches/legalHub.ko.json";

const renderPage = (ui: ReactNode) =>
  render(<I18nProvider>{ui}</I18nProvider>);

class MockIO {
  callback: IntersectionObserverCallback;
  static instances: MockIO[] = [];
  observed: Element[] = [];
  constructor(cb: IntersectionObserverCallback) {
    this.callback = cb;
    MockIO.instances.push(this);
  }
  observe(el: Element) { this.observed.push(el); }
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] { return []; }
}

beforeEach(() => {
  MockIO.instances = [];
  Object.defineProperty(window, "IntersectionObserver", {
    writable: true,
    configurable: true,
    value: MockIO,
  });
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

describe("PrivacyContent — page composition", () => {
  it("renders all 15 sections + change-log", () => {
    renderPage(<PrivacyContent />);
    for (const slug of PRIVACY.sectionSlugs) {
      const id = sectionAnchorId("privacy", slug);
      expect(
        screen.getByTestId(`legal-section-${id}`),
        `missing privacy section ${slug}`,
      ).toBeTruthy();
    }
    expect(
      screen.getByTestId(`legal-changelog-${CHANGELOG_ANCHOR.privacy}`),
    ).toBeTruthy();
  });

  it("includes the special-protection clauses (광고 미사용 / 졸업 후 자동 삭제)", () => {
    renderPage(<PrivacyContent />);
    const studentSection = screen.getByTestId(
      `legal-section-${sectionAnchorId("privacy", "studentSpecial")}`,
    );
    // 광고 / 마케팅 사용 금지
    expect(studentSection.textContent).toMatch(/광고/);
    // 졸업 / 자동 삭제
    expect(studentSection.textContent).toMatch(/자동.{0,10}삭제|졸업/);
  });

  it("includes the demo-data 24-hour deletion clause", () => {
    renderPage(<PrivacyContent />);
    const demoSection = screen.getByTestId(
      `legal-section-${sectionAnchorId("privacy", "demoData")}`,
    );
    expect(demoSection.textContent).toMatch(/24.{0,4}시간/);
  });

  it("includes the embeddings retention/deletion policy", () => {
    renderPage(<PrivacyContent />);
    const embedSection = screen.getByTestId(
      `legal-section-${sectionAnchorId("privacy", "embeddings")}`,
    );
    expect(embedSection.textContent).toMatch(/임베딩|pgvector/);
  });

  it("renders a 9-row sub-processor table that mentions HeyGen, ElevenLabs, Anthropic, OpenAI, Stripe", () => {
    renderPage(<PrivacyContent />);
    const delegationSection = screen.getByTestId(
      `legal-section-${sectionAnchorId("privacy", "delegation")}`,
    );
    const rows = delegationSection.querySelectorAll("tbody tr");
    expect(rows.length).toBe(9);
    const text = delegationSection.textContent ?? "";
    for (const vendor of ["HeyGen", "ElevenLabs", "Anthropic", "OpenAI", "Stripe"]) {
      expect(text).toContain(vendor);
    }
  });

  it("TOC has 15 article links + 1 change-log link", () => {
    renderPage(<PrivacyContent />);
    const toc = screen.getByTestId("legal-toc");
    for (const slug of PRIVACY.sectionSlugs) {
      const id = sectionAnchorId("privacy", slug);
      const link = toc.querySelector(`[data-toc-target="${id}"]`);
      expect(link).toBeTruthy();
    }
    const changeLogLink = toc.querySelector(
      `[data-toc-target="${CHANGELOG_ANCHOR.privacy}"]`,
    );
    expect(changeLogLink).toBeTruthy();
    expect(changeLogLink?.getAttribute("data-variant")).toBe("trailing");
  });

  it("change-log row count matches the i18n source-of-truth", () => {
    renderPage(<PrivacyContent />);
    const expected = legalKo.legalHub.privacy.changeLog;
    for (let i = 0; i < expected.length; i++) {
      const row = screen.getByTestId(`legal-changelog-row-${i}`);
      expect(row.textContent).toContain(expected[i].date);
      expect(row.textContent).toContain(expected[i].summary);
    }
  });

  it("clicking a TOC link calls scrollIntoView and flips data-active", () => {
    renderPage(<PrivacyContent />);
    const target = sectionAnchorId("privacy", "rights");
    const targetEl = document.getElementById(target);
    expect(targetEl).toBeTruthy();
    const spy = vi.fn();
    targetEl!.scrollIntoView = spy;
    const link = screen.getByTestId(`legal-toc-link-${target}`);
    fireEvent.click(link);
    expect(spy).toHaveBeenCalled();
    expect(link.getAttribute("data-active")).toBe("true");
  });

  it("emits cross-link to /terms", () => {
    renderPage(<PrivacyContent />);
    const cross = screen.getByTestId(
      "legal-privacy-cross-link",
    ) as HTMLAnchorElement;
    expect(cross.getAttribute("href")).toBe("/terms");
  });

  it("uses the placeholder banner so company info is clearly marked unfinished", () => {
    renderPage(<PrivacyContent />);
    const notice = screen.getByTestId("legal-privacy-notice");
    expect(notice.textContent).toContain("[PLACEHOLDER]");
  });
});
