import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "@/contexts/I18nContext";
import StatCard from "@/components/professor/dashboardHome/StatCard";

const wrap = (ui: React.ReactNode) => <I18nProvider>{ui}</I18nProvider>;

beforeEach(() => {
  // 테스트 안정성을 위해 prefers-reduced-motion=reduce 를 가정한다.
  // useCountUp 이 즉시 target 으로 점프 → 카운트업 도달 검증이 결정적.
  // 별도 카운트업 step 검증은 useCountUp.test.ts (없음) 또는 e2e 에서 진행.
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  // jsdom 은 IntersectionObserver 미구현 — 노출 시 즉시 콜백 호출하는 stub.
  class IO {
    observe(target: Element) {
      // 초기 mount 직후 entry 콜백을 동기 호출 — useCountUp 이 시작되도록.
      const cb = (this as unknown as { _cb: IntersectionObserverCallback })._cb;
      if (cb) {
        cb(
          [
            {
              isIntersecting: true,
              target,
              intersectionRatio: 1,
              boundingClientRect: target.getBoundingClientRect(),
              intersectionRect: target.getBoundingClientRect(),
              rootBounds: null,
              time: Date.now(),
            } as IntersectionObserverEntry,
          ],
          this as unknown as IntersectionObserver,
        );
      }
    }
    unobserve() {}
    disconnect() {}
    constructor(cb: IntersectionObserverCallback) {
      (this as unknown as { _cb: IntersectionObserverCallback })._cb = cb;
    }
  }
  Object.defineProperty(window, "IntersectionObserver", {
    writable: true,
    configurable: true,
    value: IO,
  });
});

describe("StatCard", () => {
  it("renders the label and unit + reaches the target value (countup)", async () => {
    render(
      wrap(
        <StatCard
          label="시청 완료율"
          value={78}
          unit="%"
          decimals={0}
          kind="positive"
        />,
      ),
    );
    // 레이블이 화면에 그려짐
    expect(screen.getByText("시청 완료율")).toBeTruthy();

    // prefers-reduced-motion=reduce 를 가정해 useCountUp 이 카운트업을
    // 스킵하고 target 으로 이행. PR #90 lint fix 후 reduce-motion 분기도
    // requestAnimationFrame 으로 한 frame 뒤에 setValue(target) 호출되므로
    // microtask flush 만으론 부족 — findByText 의 polling retry 로 한 frame
    // 대기 후 검증한다 (default timeout 1000ms 안에 충분히 fire).
    expect(await screen.findByText(/78/)).toBeTruthy();
  });

  it("shows the warn glyph and pulse class when warn=true", () => {
    const { container } = render(
      wrap(
        <StatCard
          label="미응답 Q&A"
          value={7}
          kind="attention"
          warn
        />,
      ),
    );
    // 빨강 점 + ! 글리프 (색약자 친화 이중 부호화)
    expect(screen.getByText("!")).toBeTruthy();
    // pulse-subtle 클래스가 카드에 부착
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("animate-pulse-subtle");
  });

  it("renders progress bar when progressLimit is provided", () => {
    const { container } = render(
      wrap(
        <StatCard
          label="이번 달 영상"
          value={8}
          kind="progress"
          progressLimit={20}
        />,
      ),
    );
    const bar = container.querySelector('[role="progressbar"]');
    expect(bar).toBeTruthy();
    expect(bar?.getAttribute("aria-valuenow")).toBe("40");
  });

  it("invokes onClick when the card is interacted with", () => {
    const onClick = vi.fn();
    render(
      wrap(
        <StatCard
          label="미응답 Q&A"
          value={5}
          kind="attention"
          onClick={onClick}
        />,
      ),
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("falls back to placeholder sparkline when trend is missing", () => {
    const { container } = render(
      wrap(
        <StatCard
          label="평균 정답률"
          value={82}
          kind="positive"
          trend={null}
        />,
      ),
    );
    // sparkline 자리에 점선 라인이 그려짐 — `aria-hidden` SVG 1개
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThanOrEqual(1);
  });
});
