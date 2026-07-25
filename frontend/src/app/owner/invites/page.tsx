import { redirect } from "next/navigation";

/**
 * Redirect stub — `/owner/invites` → `/admin/invites` (스펙 14 §A).
 *
 * 초대 발급 화면은 운영자 콘솔(`/admin/*`) 안으로 통합됐다. 계정주가 이 주소를
 * 북마크해 뒀을 수 있어 라우트를 삭제하지 않고 redirect 만 남긴다.
 *
 * 서버 컴포넌트에서 `redirect()` 를 쓰므로 클라이언트 깜빡임 없이 곧장 넘어간다
 * (자매 스텁 `/professor/lecture/[id]` 는 트리가 `"use client"` 라 client
 *  redirect 를 쓸 수밖에 없었지만, 여기는 그런 제약이 없다).
 */
export default function OwnerInvitesRedirect() {
  redirect("/admin/invites");
}
