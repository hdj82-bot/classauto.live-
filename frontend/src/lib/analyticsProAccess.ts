/**
 * 학습 분석 PRO 실기능 진입점(사이드바 "분석 PRO" 메뉴 · 강의 분석의 "종합보고서"
 * 버튼) 노출 대상.
 *
 * 현 단계는 계정주 2계정에만 노출하고 곧 시작할 베타테스터에게는 숨긴다. **실제
 * 접근 경계는 백엔드 `require_analytics_pro`** (이메일 허용목록 + 게이트)이며, 이
 * 목록은 UI 진입점을 가리기 위한 보조 게이트다(보안이 아니라 노출 제어). 백엔드
 * `ADMIN_EMAILS`(classauto101) + `ANALYTICS_PRO_ALLOWED_EMAILS`(hdj82) 기본값과 일치.
 */
const ALLOWED_EMAILS = ["classauto101@gmail.com", "hdj82@kyonggi.ac.kr"];

export function canSeeAnalyticsPro(email?: string | null): boolean {
  if (!email) return false;
  return ALLOWED_EMAILS.includes(email.trim().toLowerCase());
}
