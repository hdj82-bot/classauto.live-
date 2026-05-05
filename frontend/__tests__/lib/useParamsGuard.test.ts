import { describe, it, expect } from "vitest";

// useParams 의 반환값이 string | string[] | undefined 일 수 있는 경우를
// 안전하게 좁히는 패턴 단위 테스트. 실제 페이지 코드(lecture/[slug]/page.tsx)
// 의 회귀 방지용.
function pickSlug(params: { slug?: string | string[] } | null | undefined): string | undefined {
  return Array.isArray(params?.slug) ? params.slug[0] : params?.slug;
}

describe("useParams slug normalization", () => {
  it("returns the string value as-is", () => {
    expect(pickSlug({ slug: "abc" })).toBe("abc");
  });

  it("returns the first element when slug is an array", () => {
    expect(pickSlug({ slug: ["a", "b"] })).toBe("a");
  });

  it("returns undefined when slug is missing", () => {
    expect(pickSlug({})).toBeUndefined();
  });

  it("returns undefined when params itself is null/undefined", () => {
    expect(pickSlug(null)).toBeUndefined();
    expect(pickSlug(undefined)).toBeUndefined();
  });

  it("returns undefined for an empty array (caller must guard !slug)", () => {
    expect(pickSlug({ slug: [] })).toBeUndefined();
  });
});
