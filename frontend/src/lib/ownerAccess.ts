/**
 * 운영자(계정주) 전용 진입점 노출 대상 — 관리자 콘솔(`/admin/*`).
 *
 * 실제 접근 경계는 백엔드 `ADMIN_EMAILS`(require_owner · require_admin)이며, 이 목록은
 * 교수자 사이드바 메뉴·콘솔 페이지 같은 UI 진입점을 가리기 위한 보조 게이트다(보안이
 * 아니라 노출 제어). 백엔드 `ADMIN_EMAILS` 기본값(classauto101 · hdj82)과 일치시킨다.
 *
 * 운영자는 role 을 admin 으로 바꾸지 않고 교수자 계정을 유지하므로(강의 제작·학습분석
 * PRO 가 깨지지 않게), 콘솔 진입 판정은 role 이 아니라 이 이메일 목록으로 한다.
 *
 * 종전엔 `canManageInvites`(초대 화면 전용)와 `isOwnerEmail`(콘솔 전용)이 같은 목록을
 * 두 이름으로 감싸고 있었다. 스펙 14 §E 에서 사이드바 진입점이 초대 하나가 아니라 콘솔
 * 전체(`/admin`)로 바뀌면서 구분이 사라져 `isOwnerEmail` 하나로 합쳤다.
 */
const OWNER_EMAILS = ["classauto101@gmail.com", "hdj82@kyonggi.ac.kr"];

/** 관리자 콘솔(`/admin/*`) 진입 대상 — role 무관, 운영자 이메일. */
export function isOwnerEmail(email?: string | null): boolean {
  if (!email) return false;
  return OWNER_EMAILS.includes(email.trim().toLowerCase());
}
