/**
 * 사이트 정규 URL — robots.txt / sitemap.xml 이 공유한다.
 *
 * 두 라우트가 같은 base 를 써야 sitemap 선언 URL 과 robots 의 host/sitemap
 * 지시가 일치한다(불일치 시 크롤러가 sitemap 을 무시). i18n 은 path 기반이
 * 아니라 클라이언트 I18nContext 로 처리되므로 정규 URL 은 로케일 무관 단일
 * 세트다(per-locale alternate 불필요).
 *
 * 프로덕션 도메인은 classauto.live 로 확정(CLAUDE.md·배포 문서). 프리뷰/
 * 스테이징에서 다른 도메인을 쓰면 NEXT_PUBLIC_SITE_URL 로 오버라이드한다.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://classauto.live"
).replace(/\/$/, "");
