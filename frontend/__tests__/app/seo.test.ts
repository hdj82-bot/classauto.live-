import { describe, it, expect } from "vitest";

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { SITE_URL } from "@/lib/site";

/**
 * robots.txt ↔ sitemap.xml 정합성 가드.
 *
 * 핵심 회귀 위험: 인증 필요 경로가 sitemap 에 새어 색인되거나, robots 와
 * sitemap 의 base URL 이 어긋나 크롤러가 sitemap 을 무시하는 것. 두 라우트가
 * 같은 정책·같은 SITE_URL 을 쓰는지 강제한다.
 */
describe("robots.txt", () => {
  const r = robots();

  it("sitemap·host 가 SITE_URL 단일 출처와 일치", () => {
    expect(r.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
    expect(r.host).toBe(SITE_URL);
    expect(SITE_URL.endsWith("/")).toBe(false);
  });

  it("인증/유틸 경로를 disallow", () => {
    const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    const disallow = ([] as string[]).concat(rule.disallow ?? []);
    for (const p of ["/admin/", "/auth/", "/dashboard", "/professor/", "/v/"]) {
      expect(disallow).toContain(p);
    }
  });
});

describe("sitemap.xml", () => {
  const entries = sitemap();
  const paths = entries.map((e) => e.url.replace(SITE_URL, ""));

  it("랜딩·핵심 마케팅 페이지 포함, 전부 SITE_URL 절대 URL", () => {
    expect(paths).toContain("/");
    for (const p of ["/features", "/pricing", "/demo"]) {
      expect(paths).toContain(p);
    }
    for (const e of entries) {
      expect(e.url.startsWith(`${SITE_URL}/`) || e.url === `${SITE_URL}/`).toBe(
        true,
      );
      expect(e.priority).toBeGreaterThanOrEqual(0);
      expect(e.priority).toBeLessThanOrEqual(1);
    }
  });

  it("robots 가 차단한 경로는 절대 미포함 (인증 페이지 색인 누출 방지)", () => {
    const rule = Array.isArray(robots().rules)
      ? (robots().rules as Array<{ disallow?: string | string[] }>)[0]
      : (robots().rules as { disallow?: string | string[] });
    const disallow = ([] as string[]).concat(rule.disallow ?? []);
    for (const url of paths) {
      for (const blocked of disallow) {
        // disallow 프리픽스로 시작하는 sitemap 경로가 있으면 정책 모순.
        expect(url.startsWith(blocked)).toBe(false);
      }
    }
  });

  it("중복 URL 없음", () => {
    expect(new Set(paths).size).toBe(paths.length);
  });
});
