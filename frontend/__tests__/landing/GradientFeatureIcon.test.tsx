import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import GradientFeatureIcon from "@/components/landing/GradientFeatureIcon";

describe("GradientFeatureIcon", () => {
  it("path d 속성과 그라데이션 stroke 가 정확히 적용", () => {
    const path = "M5 5L10 10";
    const { container } = render(
      <GradientFeatureIcon path={path} gradient="electric" />,
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    const p = container.querySelector("path");
    expect(p?.getAttribute("d")).toBe(path);
    expect(p?.getAttribute("stroke")).toBe("url(#grad-electric)");
  });

  it("4가지 그라데이션 모두 url(#grad-X) 로 매핑", () => {
    const variants = ["violet", "electric", "cyan", "pink"] as const;
    for (const g of variants) {
      const { container } = render(
        <GradientFeatureIcon path="M0 0" gradient={g} />,
      );
      expect(container.querySelector("path")?.getAttribute("stroke")).toBe(
        `url(#grad-${g})`,
      );
    }
  });

  it("hoverRotate=true (기본) 시 motion-safe:group-hover 트랜지션 클래스 포함", () => {
    const { container } = render(
      <GradientFeatureIcon path="M0 0" gradient="violet" />,
    );
    const svg = container.querySelector("svg");
    expect(svg?.className.baseVal).toContain("motion-safe:group-hover");
  });

  it("hoverRotate=false 시 hover 트랜지션 클래스 미포함", () => {
    const { container } = render(
      <GradientFeatureIcon path="M0 0" gradient="violet" hoverRotate={false} />,
    );
    const svg = container.querySelector("svg");
    expect(svg?.className.baseVal).not.toContain("group-hover");
  });

  it("aria-hidden=true 로 장식 아이콘 명시 (decorative)", () => {
    const { container } = render(
      <GradientFeatureIcon path="M0 0" gradient="cyan" />,
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
  });
});
