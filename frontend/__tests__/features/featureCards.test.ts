import { describe, it, expect } from "vitest";
import { FEATURE_CARDS } from "@/components/features/featureCards";
import featuresKo from "@/../messages/_patches/featuresHub.ko.json";
import featuresEn from "@/../messages/_patches/featuresHub.en.json";

/**
 * 9개 카드의 메타가 README §주요 기능 표를 1:1 로 반영하는지 검증.
 *
 * - i18n 키 (ko/en) 가 모두 채워졌는지
 * - 9개 항목인지
 * - SVG path 가 비어있지 않은지
 */
describe("FEATURE_CARDS metadata", () => {
  it("matches README §주요 기능 with 9 entries", () => {
    expect(FEATURE_CARDS).toHaveLength(9);
  });

  it.each(FEATURE_CARDS.map((c) => [c.key, c]))(
    "card '%s' has icon path and i18n keys in both locales",
    (_key, card) => {
      expect(card.iconPath.length).toBeGreaterThan(0);
      const ko = featuresKo.featuresHub.cards.items as Record<
        string,
        { title: string; desc: string }
      >;
      const en = featuresEn.featuresHub.cards.items as Record<
        string,
        { title: string; desc: string }
      >;
      expect(ko[card.key]).toBeDefined();
      expect(en[card.key]).toBeDefined();
      expect(ko[card.key].title.length).toBeGreaterThan(0);
      expect(ko[card.key].desc.length).toBeGreaterThan(0);
      expect(en[card.key].title.length).toBeGreaterThan(0);
      expect(en[card.key].desc.length).toBeGreaterThan(0);
    },
  );

  it("uses one of 5 allowed accent gradients", () => {
    const allowed = new Set(["electric", "violet", "cyan", "pink", "success"]);
    for (const card of FEATURE_CARDS) {
      expect(allowed.has(card.accent)).toBe(true);
    }
  });
});

describe("featuresHub i18n patches", () => {
  it("ko/en share the same key tree under featuresHub.*", () => {
    function shape(node: unknown): unknown {
      if (Array.isArray(node)) return node.map(shape);
      if (node && typeof node === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(node)) out[k] = shape(v);
        return out;
      }
      return typeof node;
    }
    expect(shape(featuresKo)).toEqual(shape(featuresEn));
  });

  it("does not collide with the existing 'features' substring in marketing.useCases.*", () => {
    // marketing 패치에는 useCases.cards.*.features (string[]) 라는 nested
    // 필드가 있어 namespace 가 아닌 데이터 키. 본 워크트리는 top-level
    // namespace 를 'featuresHub' 로 두어 충돌이 발생하지 않음을 검증.
    expect(featuresKo.featuresHub).toBeDefined();
    expect(
      (featuresKo as unknown as { features?: unknown }).features,
    ).toBeUndefined();
  });
});
