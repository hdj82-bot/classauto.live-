import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

/**
 * sitemap.xml (App Router 동적 생성).
 *
 * 공개 마케팅·정보 페이지만 포함한다. 인증 필요(`/dashboard`·`/professor`·
 * `/admin`·`/profile`), 동적 학습 경로(`/lecture/[slug]`·`/v/[slug]`), 인증
 * 흐름(`/auth/*`), 유틸 상태(`/expired`·`/offline`)는 robots.ts 차단 정책과
 * 동일하게 제외(가드 테스트로 두 파일 정합성 강제).
 *
 * i18n 은 path 기반이 아니므로(클라이언트 I18nContext) 로케일별 alternate
 * 없이 정규 URL 단일 세트. lastModified 는 빌드 시각 — 정적 마케팅 페이지라
 * 페이지별 콘텐츠 변경 추적보다 배포 시점이 더 정확한 신호다.
 */
const PUBLIC_ROUTES: ReadonlyArray<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}> = [
  { path: "/", changeFrequency: "weekly", priority: 1.0 },
  { path: "/features", changeFrequency: "monthly", priority: 0.9 },
  { path: "/pricing", changeFrequency: "monthly", priority: 0.9 },
  { path: "/demo", changeFrequency: "monthly", priority: 0.9 },
  { path: "/use-cases", changeFrequency: "monthly", priority: 0.7 },
  { path: "/trust", changeFrequency: "monthly", priority: 0.7 },
  { path: "/security", changeFrequency: "monthly", priority: 0.6 },
  { path: "/student-guide", changeFrequency: "monthly", priority: 0.6 },
  { path: "/analytics-example", changeFrequency: "monthly", priority: 0.5 },
  { path: "/beta-apply", changeFrequency: "monthly", priority: 0.7 },
  { path: "/contact", changeFrequency: "yearly", priority: 0.5 },
  { path: "/help", changeFrequency: "monthly", priority: 0.5 },
  { path: "/changelog", changeFrequency: "weekly", priority: 0.5 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PUBLIC_ROUTES.map(({ path, changeFrequency, priority }) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
