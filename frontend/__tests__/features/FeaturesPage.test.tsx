import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "@/contexts/I18nContext";
import FeaturesContent from "@/components/features/FeaturesContent";
import { FEATURE_CARDS } from "@/components/features/featureCards";

// MarketingShell uses useMarketingI18n inside which uses messages.useMarketingI18n.
// 그대로 I18nProvider 감싸면 messages 가 정상 lookup 됨.
const renderPage = (ui: ReactNode) =>
  render(<I18nProvider>{ui}</I18nProvider>);

// IntersectionObserver / matchMedia 가 jsdom 에 없어서 mock 필요. 테스트별로
// reduced-motion, intersect 진입을 흉내내기 위해 객체를 직접 조작.

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
  trigger(isIntersecting: boolean) {
    const entries = this.observed.map((target) => ({
      isIntersecting,
      target,
      time: 0,
      boundingClientRect: target.getBoundingClientRect(),
      intersectionRatio: isIntersecting ? 1 : 0,
      intersectionRect: target.getBoundingClientRect(),
      rootBounds: null,
    })) as IntersectionObserverEntry[];
    this.callback(entries, this as unknown as IntersectionObserver);
  }
}

function setupReducedMotion(value: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("reduce") ? value : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

beforeEach(() => {
  MockIO.instances = [];
  // Default: motion enabled
  setupReducedMotion(false);
  // Mount IO mock
  Object.defineProperty(window, "IntersectionObserver", {
    writable: true,
    configurable: true,
    value: MockIO,
  });
  // performance.now is real by default; use real timers
});

describe("FeaturesContent — page composition", () => {
  it("renders the 7 expected sections", () => {
    renderPage(<FeaturesContent />);
    expect(screen.getByTestId("features-hero")).toBeTruthy();
    expect(screen.getByTestId("features-section-morph")).toBeTruthy();
    expect(screen.getByTestId("features-section-modules")).toBeTruthy();
    expect(screen.getByTestId("features-section-cards")).toBeTruthy();
    expect(screen.getByTestId("features-section-progress")).toBeTruthy();
    expect(screen.getByTestId("features-section-iso")).toBeTruthy();
  });

  it("renders all 9 capability cards from README §주요 기능", () => {
    renderPage(<FeaturesContent />);
    for (const card of FEATURE_CARDS) {
      expect(
        screen.getByTestId(`features-card-${card.key}`),
      ).toBeTruthy();
    }
    expect(FEATURE_CARDS).toHaveLength(9);
  });

  it("hero CTAs link to /beta-apply and /demo", () => {
    renderPage(<FeaturesContent />);
    const primary = screen.getByTestId("features-hero-cta-primary") as HTMLAnchorElement;
    const secondary = screen.getByTestId("features-hero-cta-secondary") as HTMLAnchorElement;
    expect(primary.getAttribute("href")).toBe("/beta-apply");
    expect(secondary.getAttribute("href")).toBe("/demo");
  });

  it("provides accessible alt text on the morph illustration", () => {
    renderPage(<FeaturesContent />);
    const alt = screen.getByTestId("features-morph-alt");
    // i18n 키가 그대로 노출되지 않아야 함 (=실제 한국어 문장으로 치환)
    expect(alt.textContent && alt.textContent.length > 0).toBe(true);
    expect(alt.textContent).not.toContain("morph.altMorph");
  });

  it("wires the module quad with 4 distinct labelled parts", () => {
    renderPage(<FeaturesContent />);
    expect(screen.getByTestId("features-module-quad")).toBeTruthy();
    expect(screen.getByTestId("features-module-part-content")).toBeTruthy();
    expect(screen.getByTestId("features-module-part-assess")).toBeTruthy();
    expect(screen.getByTestId("features-module-part-analytics")).toBeTruthy();
    expect(screen.getByTestId("features-module-part-ops")).toBeTruthy();
    // 4 parts share the `fhub-module-part` class, anchored to one of 4 corners
    const positions = ["tl", "tr", "bl", "br"].map((p) =>
      document.querySelector(`.fhub-module-part--${p}`),
    );
    expect(positions.every((el) => el !== null)).toBe(true);
  });

  it("module quad container is keyboard-focusable for the hover-equivalent split", () => {
    renderPage(<FeaturesContent />);
    const quad = screen.getByTestId("features-module-quad");
    const focusable = quad.querySelector('[role="group"][tabindex="0"]');
    expect(focusable).toBeTruthy();
  });
});

describe("FeaturesContent — ProgressShimmer (§3.3)", () => {
  it("starts at 0% before intersection and exposes progressbar role", () => {
    renderPage(<FeaturesContent />);
    const card = screen.getByTestId("features-progress-card");
    expect(card.getAttribute("data-progress")).toBe("0");
    expect(card.getAttribute("data-complete")).toBe("false");
    const bar = card.querySelector('[role="progressbar"]');
    expect(bar?.getAttribute("aria-valuemin")).toBe("0");
    expect(bar?.getAttribute("aria-valuemax")).toBe("100");
  });

  it("starts ticking when the IntersectionObserver reports visibility", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    try {
      renderPage(<FeaturesContent />);
      // The most recent IO instance is for ProgressShimmer (last-mounted IO observer)
      const io = MockIO.instances[MockIO.instances.length - 1];
      expect(io).toBeTruthy();

      await act(async () => {
        io.trigger(true);
      });
      // advance through full duration
      await act(async () => {
        vi.advanceTimersByTime(7000);
      });

      const card = screen.getByTestId("features-progress-card");
      expect(card.getAttribute("data-complete")).toBe("true");
      expect(screen.getByTestId("features-progress-check")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("'replay' resets the bar back to 0%", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    try {
      renderPage(<FeaturesContent />);
      const io = MockIO.instances[MockIO.instances.length - 1];
      await act(async () => {
        io.trigger(true);
      });
      await act(async () => {
        vi.advanceTimersByTime(7000);
      });
      // Now click replay
      await act(async () => {
        fireEvent.click(screen.getByTestId("features-progress-replay"));
      });
      const card = screen.getByTestId("features-progress-card");
      // Right after replay, before any timers run, progress should be 0.
      expect(card.getAttribute("data-progress")).toBe("0");
    } finally {
      vi.useRealTimers();
    }
  });

  it("respects prefers-reduced-motion: reduce — jumps to 100% statically without observer ticks", async () => {
    setupReducedMotion(true);
    renderPage(<FeaturesContent />);
    const card = screen.getByTestId("features-progress-card");
    expect(card.getAttribute("data-progress")).toBe("100");
    expect(card.getAttribute("data-complete")).toBe("true");
    expect(screen.getByTestId("features-progress-check")).toBeTruthy();
  });
});
