/**
 * 계정주(운영자) 전용 진입점 노출 대상 — 베타테스터 초대 관리(`/owner/invites`) 등.
 *
 * 실제 접근 경계는 백엔드 `require_owner`(ADMIN_EMAILS 이메일 허용목록)이며, 이
 * 목록은 사이드바 메뉴 같은 UI 진입점을 가리기 위한 보조 게이트다(보안이 아니라
 * 노출 제어). 백엔드 `ADMIN_EMAILS` 기본값(classauto101@gmail.com)과 일치시킨다.
 */
const OWNER_EMAILS = ["classauto101@gmail.com"];

export function canManageInvites(email?: string | null): boolean {
  if (!email) return false;
  return OWNER_EMAILS.includes(email.trim().toLowerCase());
}
