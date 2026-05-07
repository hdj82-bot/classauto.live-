import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import FadeInSection from "@/components/landing/FadeInSection";

describe("FadeInSection", () => {
  it("immediate=true 시 data-visible='true' + opacity-100", () => {
    const { container } = render(
      <FadeInSection immediate>
        <p>hello</p>
      </FadeInSection>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.getAttribute("data-visible")).toBe("true");
    expect(wrapper.className).toContain("opacity-100");
    expect(wrapper.className).not.toContain("opacity-0");
  });

  it("immediate=false 일 때 초기 상태는 invisible (opacity-0)", () => {
    const { container } = render(
      <FadeInSection immediate={false}>
        <p>hello</p>
      </FadeInSection>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    // 초기 동기 렌더 — 아직 useEffect 의 rAF 가 fire 되기 전이므로 invisible.
    expect(wrapper.getAttribute("data-visible")).toBe("false");
  });

  it("as=section prop 으로 wrapper 태그 변경", () => {
    const { container } = render(
      <FadeInSection immediate as="section">
        <p>x</p>
      </FadeInSection>,
    );
    expect(container.firstElementChild?.tagName).toBe("SECTION");
  });

  it("delayMs > 0 시 transition-delay 인라인 스타일 적용", () => {
    const { container } = render(
      <FadeInSection immediate delayMs={250}>
        <p>x</p>
      </FadeInSection>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.transitionDelay).toBe("250ms");
  });

  it("motion-reduce 친화 클래스 포함 (prefers-reduced-motion 사용자 fallback)", () => {
    const { container } = render(
      <FadeInSection immediate={false}>
        <p>x</p>
      </FadeInSection>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("motion-reduce:opacity-100");
  });
});
