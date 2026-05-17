import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

/**
 * robots.txt (App Router 동적 생성).
 *
 * 공개 마케팅·정보 페이지는 색인 허용, 인증 필요/유틸/동적 학습 경로는 차단.
 * disallow 목록은 sitemap.ts 의 제외 목록과 동일 정책을 공유한다(가드 테스트로
 * 강제). `host`/`sitemap` 은 SITE_URL 단일 출처를 써 선언 URL 과 일치시킨다.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/auth/",
        "/dashboard",
        "/professor/",
        "/profile",
        "/lecture/",
        "/v/",
        "/expired",
        "/offline",
        "/api/",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
