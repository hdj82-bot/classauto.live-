import { describe, it, expect } from "vitest";
import {
  CHANGELOG_ANCHOR,
  PRIVACY,
  TERMS,
  sectionAnchorId,
} from "@/components/legal/legalSections";
import legalKo from "@/../messages/_patches/legalHub.ko.json";
import legalEn from "@/../messages/_patches/legalHub.en.json";

/**
 * 본 페이지의 source-of-truth 는 두 곳:
 *   1. legalSections.ts 의 sectionSlugs 배열 (페이지가 렌더할 순서)
 *   2. messages/_patches/legalHub.{ko,en}.json 의 sections.<slug> 객체
 *
 * 이 두 source 가 어긋나면 사용자에게 빈 섹션 또는 누락된 anchor 가 노출되므로
 * 본 테스트가 회귀 검증한다.
 */

describe("legalSections — DocumentSpec / dictionary 정합", () => {
  it("ToS 는 14개 조항 + 변경 이력 1개 anchor", () => {
    expect(TERMS.sectionSlugs).toHaveLength(14);
    expect(CHANGELOG_ANCHOR.terms).toBe("terms-changelog");
  });

  it("Privacy 는 15개 항목 + 변경 이력 1개 anchor", () => {
    expect(PRIVACY.sectionSlugs).toHaveLength(15);
    expect(CHANGELOG_ANCHOR.privacy).toBe("privacy-changelog");
  });

  it("ToS 의 모든 slug 가 ko/en 사전에 동시에 존재한다", () => {
    const ko = legalKo.legalHub.terms.sections as Record<string, unknown>;
    const en = legalEn.legalHub.terms.sections as Record<string, unknown>;
    for (const slug of TERMS.sectionSlugs) {
      expect(ko[slug], `ko missing terms.${slug}`).toBeTruthy();
      expect(en[slug], `en missing terms.${slug}`).toBeTruthy();
    }
  });

  it("Privacy 의 모든 slug 가 ko/en 사전에 동시에 존재한다", () => {
    const ko = legalKo.legalHub.privacy.sections as Record<string, unknown>;
    const en = legalEn.legalHub.privacy.sections as Record<string, unknown>;
    for (const slug of PRIVACY.sectionSlugs) {
      expect(ko[slug], `ko missing privacy.${slug}`).toBeTruthy();
      expect(en[slug], `en missing privacy.${slug}`).toBeTruthy();
    }
  });

  it("ko/en 사전이 정확히 같은 키 집합을 갖는다 (양쪽 동수)", () => {
    function paths(value: unknown, base = ""): string[] {
      if (Array.isArray(value)) {
        return value.flatMap((v, i) => paths(v, `${base}[${i}]`));
      }
      if (value && typeof value === "object") {
        return Object.entries(value).flatMap(([k, v]) =>
          paths(v, base ? `${base}.${k}` : k),
        );
      }
      // leaf — return path with sentinel
      return [base];
    }
    const koPaths = paths(legalKo).sort();
    const enPaths = paths(legalEn).sort();
    expect(koPaths).toEqual(enPaths);
  });

  it("sectionAnchorId 는 두 문서의 anchor 가 충돌하지 않게 prefix 한다", () => {
    expect(sectionAnchorId("terms", "purpose")).toBe("terms-section-purpose");
    expect(sectionAnchorId("privacy", "purpose")).toBe(
      "privacy-section-purpose",
    );
    expect(sectionAnchorId("terms", "purpose")).not.toBe(
      sectionAnchorId("privacy", "purpose"),
    );
  });

  it("ToS 각 조항이 number 와 title 필드를 갖고, blocks 가 비어있지 않다", () => {
    const ko = legalKo.legalHub.terms.sections as Record<
      string,
      { number: string; title: string; blocks: unknown[] }
    >;
    for (const slug of TERMS.sectionSlugs) {
      const data = ko[slug];
      expect(data.number.length).toBeGreaterThan(0);
      expect(data.title.length).toBeGreaterThan(0);
      expect(data.blocks.length).toBeGreaterThan(0);
    }
  });

  it("Privacy 각 항목이 number 와 title 필드를 갖고, blocks 가 비어있지 않다", () => {
    const ko = legalKo.legalHub.privacy.sections as Record<
      string,
      { number: string; title: string; blocks: unknown[] }
    >;
    for (const slug of PRIVACY.sectionSlugs) {
      const data = ko[slug];
      expect(data.number.length).toBeGreaterThan(0);
      expect(data.title.length).toBeGreaterThan(0);
      expect(data.blocks.length).toBeGreaterThan(0);
    }
  });

  it("ToS 의 조항 번호가 1~14 까지 빠짐없이 1:1 로 매칭된다", () => {
    const ko = legalKo.legalHub.terms.sections as Record<
      string,
      { number: string }
    >;
    const numbers = TERMS.sectionSlugs.map((s) => ko[s].number);
    // Korean numbers are "제1조" ~ "제14조"
    for (let i = 0; i < TERMS.sectionSlugs.length; i++) {
      expect(numbers[i]).toBe(`제${i + 1}조`);
    }

    const en = legalEn.legalHub.terms.sections as Record<
      string,
      { number: string }
    >;
    const enNumbers = TERMS.sectionSlugs.map((s) => en[s].number);
    for (let i = 0; i < TERMS.sectionSlugs.length; i++) {
      expect(enNumbers[i]).toBe(`Article ${i + 1}`);
    }
  });

  it("Privacy 의 항목 번호가 1.~15. 까지 빠짐없이 매칭된다", () => {
    const ko = legalKo.legalHub.privacy.sections as Record<
      string,
      { number: string }
    >;
    for (let i = 0; i < PRIVACY.sectionSlugs.length; i++) {
      expect(ko[PRIVACY.sectionSlugs[i]].number).toBe(`${i + 1}.`);
    }
    const en = legalEn.legalHub.privacy.sections as Record<
      string,
      { number: string }
    >;
    for (let i = 0; i < PRIVACY.sectionSlugs.length; i++) {
      expect(en[PRIVACY.sectionSlugs[i]].number).toBe(`${i + 1}.`);
    }
  });

  it("두 문서가 모두 changeLog 항목 (date + summary) 을 가진다", () => {
    const koTermsLog = legalKo.legalHub.terms.changeLog;
    const enTermsLog = legalEn.legalHub.terms.changeLog;
    expect(koTermsLog.length).toBeGreaterThanOrEqual(1);
    expect(enTermsLog.length).toEqual(koTermsLog.length);
    for (const entry of koTermsLog) {
      expect(/^\d{4}-\d{2}-\d{2}$/.test(entry.date)).toBe(true);
      expect(entry.summary.length).toBeGreaterThan(0);
    }

    const koPrivLog = legalKo.legalHub.privacy.changeLog;
    const enPrivLog = legalEn.legalHub.privacy.changeLog;
    expect(koPrivLog.length).toBeGreaterThanOrEqual(1);
    expect(enPrivLog.length).toEqual(koPrivLog.length);
  });

  it("hero.lastUpdated / effectiveDate 는 두 언어 모두 ISO 형식 YYYY-MM-DD", () => {
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    expect(iso.test(legalKo.legalHub.terms.hero.lastUpdated)).toBe(true);
    expect(iso.test(legalKo.legalHub.terms.hero.effectiveDate)).toBe(true);
    expect(iso.test(legalKo.legalHub.privacy.hero.lastUpdated)).toBe(true);
    expect(iso.test(legalKo.legalHub.privacy.hero.effectiveDate)).toBe(true);
    expect(iso.test(legalEn.legalHub.terms.hero.lastUpdated)).toBe(true);
    expect(iso.test(legalEn.legalHub.terms.hero.effectiveDate)).toBe(true);
    expect(iso.test(legalEn.legalHub.privacy.hero.lastUpdated)).toBe(true);
    expect(iso.test(legalEn.legalHub.privacy.hero.effectiveDate)).toBe(true);
  });
});
